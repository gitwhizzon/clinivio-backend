import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Issuer, generators, Client } from 'openid-client';
import Redis from 'ioredis';

export const SSO_REDIS_CLIENT = 'SSO_REDIS_CLIENT';

const STATE_TTL_SECONDS = 300; // 5 min — covers the full redirect round trip to Entra and back
const EXCHANGE_CODE_TTL_SECONDS = 60; // one-time code, single use, short-lived

export interface MicrosoftProfile {
  oid: string;
  email: string | null;
  tid: string;
}

@Injectable()
export class MicrosoftSsoService {
  private readonly logger = new Logger(MicrosoftSsoService.name);
  private client: Client | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SSO_REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private get tenantId(): string {
    return this.configService.get<string>('azureAd.tenantId') ?? '';
  }

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;

    if (!this.tenantId) {
      throw new Error('AZURE_AD_TENANT_ID is not configured');
    }

    const issuer = await Issuer.discover(
      `https://login.microsoftonline.com/${this.tenantId}/v2.0`,
    );

    this.client = new issuer.Client({
      client_id: this.configService.get<string>('azureAd.clientId') ?? '',
      client_secret: this.configService.get<string>('azureAd.clientSecret') ?? '',
      redirect_uris: [this.configService.get<string>('azureAd.redirectUri') ?? ''],
      response_types: ['code'],
    });

    return this.client;
  }

  /**
   * Builds the Entra ID authorization URL (auth code + PKCE) and stashes the
   * PKCE code_verifier server-side, keyed by the state param, so the
   * callback can complete the exchange without trusting anything the
   * browser sends back except that opaque state value.
   */
  async getAuthorizationUrl(): Promise<string> {
    const client = await this.getClient();

    const state = generators.state();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    await this.redis.setex(
      `sso:state:${state}`,
      STATE_TTL_SECONDS,
      codeVerifier,
    );

    return client.authorizationUrl({
      scope: 'openid profile email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
  }

  /**
   * Completes the code exchange server-to-server (the client secret never
   * touches the browser) and validates the id_token's tid claim matches our
   * single tenant before returning the profile. Throws on any mismatch or
   * expired/unknown state (CSRF protection — state must have been one we
   * ourselves issued and stored).
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<MicrosoftProfile> {
    const stateKey = `sso:state:${state}`;
    const codeVerifier = await this.redis.get(stateKey);
    if (!codeVerifier) {
      throw new UnauthorizedException('Invalid or expired SSO state');
    }
    await this.redis.del(stateKey);

    const client = await this.getClient();
    const redirectUri = this.configService.get<string>('azureAd.redirectUri');

    const tokenSet = await client.callback(
      redirectUri,
      { code, state },
      { code_verifier: codeVerifier, state },
    );

    const claims = tokenSet.claims();
    const oid = claims.oid as string | undefined;
    const tid = claims.tid as string | undefined;
    const email = (claims.email ?? claims.preferred_username ?? null) as
      | string
      | null;

    if (!oid || !tid) {
      throw new UnauthorizedException('Microsoft profile missing required claims');
    }

    if (tid !== this.tenantId) {
      this.logger.warn(
        `SSO rejected — tid mismatch. Expected ${this.tenantId}, got ${tid}`,
      );
      throw new UnauthorizedException('This Microsoft account is not part of the authorized organization');
    }

    return { oid, email, tid };
  }

  /**
   * Stores the freshly-issued JWT/refreshToken payload under a random
   * one-time code so the browser redirect only ever carries an opaque,
   * short-lived, single-use reference — never the tokens themselves.
   */
  async storeExchangeCode(payload: unknown): Promise<string> {
    const code = generators.random(32);
    await this.redis.setex(
      `sso:exchange:${code}`,
      EXCHANGE_CODE_TTL_SECONDS,
      JSON.stringify(payload),
    );
    return code;
  }

  /** Single-use: the code is deleted on first read, valid or not. */
  async consumeExchangeCode(code: string): Promise<unknown | null> {
    const key = `sso:exchange:${code}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return JSON.parse(raw);
  }
}
