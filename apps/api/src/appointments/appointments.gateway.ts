import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { isAllowedPlatformOrigin } from '@mediflow/shared';

function extractCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * AppointmentsGateway — real-time appointment status updates via WebSocket,
 * used by the patient portal.
 *
 * Every connection is authenticated with the same patient JWT the REST API
 * uses (previously this gateway did not authenticate connections at all,
 * and let any client join any tenant's room just by naming its UUID —
 * clients now only ever join the room for the tenant their own verified
 * token belongs to; a client-supplied tenantId is never trusted).
 *
 * Events emitted to clients:
 *   appointment:statusUpdate  { id, status, tokenNumber }
 *
 * Events received from clients:
 *   subscribe — join this connection's own tenant room for live updates
 */
@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || process.env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
      }
      const platformDomains = (process.env.PLATFORM_DOMAINS ?? 'clinivio.ai,whizzon.ai')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      callback(null, isAllowedPlatformOrigin(origin, platformDomains));
    },
    credentials: true,
  },
  namespace: '/appointments',
})
export class AppointmentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppointmentsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`[WS] Connection rejected (no token): ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<{
        tenantId: string;
        type?: string;
      }>(token);
      if (payload.type !== 'PATIENT' || !payload.tenantId) {
        throw new Error('Not a patient token');
      }
      client.data.tenantId = payload.tenantId;
      this.logger.debug(
        `[WS] Client connected: ${client.id} tenant=${payload.tenantId}`,
      );
    } catch {
      this.logger.warn(`[WS] Connection rejected (invalid token): ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`[WS] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    // Deliberately ignores any client-supplied tenantId — always uses the
    // one verified at connection time from the token itself.
    const tenantId = client.data?.tenantId;
    if (!tenantId) return;
    const room = `tenant:${tenantId}`;
    client.join(room);
    this.logger.debug(`[WS] ${client.id} joined room ${room}`);
  }

  /**
   * Called by AppointmentsService after any status mutation.
   * Broadcasts to all clients in the tenant's room.
   */
  emitStatusUpdate(
    tenantId: string,
    payload: { id: string; status: string; tokenNumber?: number | null },
  ) {
    const room = `tenant:${tenantId}`;
    this.server.to(room).emit('appointment:statusUpdate', payload);
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) return authToken;
    // Fallback: the httpOnly patientAccessToken cookie, sent automatically
    // by the browser on the WS upgrade request for same-site connections.
    return extractCookie(client.handshake.headers?.cookie, 'patientAccessToken');
  }
}
