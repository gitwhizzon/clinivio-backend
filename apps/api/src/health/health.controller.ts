import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from "@nestjs/terminus";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    // Default pingCheck timeout is 1000ms, which a fresh connection to the
    // Neon pooler can exceed on its own (observed ~1.8s for a cold
    // connection + SSL handshake from higher-latency networks) even though
    // the database is perfectly reachable — this was producing false "down"
    // health checks.
    return this.health.check([
      () => this.db.pingCheck("database", { timeout: 5000 }),
    ]);
  }
}
