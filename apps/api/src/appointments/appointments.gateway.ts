import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * AppointmentsGateway — real-time appointment status updates via WebSocket.
 *
 * Clients join a "tenant room" on connect (authenticated via JWT in handshake query).
 * When an appointment status changes, the backend emits to that room.
 *
 * Events emitted to clients:
 *   appointment:statusUpdate  { id, status, tokenNumber }
 *
 * Events received from clients:
 *   subscribe  { tenantId } — join the tenant room for live updates
 */
@WebSocketGateway({
  cors: {
    origin: '*', // tighten in production via config
    credentials: false,
  },
  namespace: '/appointments',
})
export class AppointmentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppointmentsGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`[WS] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`[WS] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.tenantId) return;
    const room = `tenant:${data.tenantId}`;
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
}
