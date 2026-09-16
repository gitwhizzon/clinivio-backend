import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  Appointment,
  NotificationLog,
  AppointmentStatus,
} from '@mediflow/database';
import { addDays, addMinutes, startOfDay } from 'date-fns';

/**
 * NOTE: Cron jobs run outside of any tenant ALS context — there is no incoming
 * HTTP request to extract a subdomain from. This service queries the shared
 * platform DataSource directly, which naturally returns appointments across
 * every hospital (all tenants share one `appointments` table, distinguished
 * by `tenantId`). `appointment.tenantId` is forwarded into each queued
 * notification job so downstream handlers stay tenant-aware.
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @InjectDataSource() private readonly platformDs: DataSource,
    @InjectQueue('notifications')
    private notificationsQueue: Queue,
  ) {}

  /**
   * Runs at 07:00 every day.
   * Finds appointments scheduled for tomorrow that haven't had a 24h reminder sent.
   */
  @Cron('0 7 * * *')
  async sendDailyReminders() {
    this.logger.log('Running daily 24h appointment reminder job...');

    const tomorrow = addDays(new Date(), 1);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

    try {
      const appointments = await this.platformDs
        .getRepository(Appointment)
        .createQueryBuilder('appt')
        .leftJoinAndSelect('appt.patient', 'patient')
        .leftJoinAndSelect('appt.doctor', 'doctor')
        .leftJoinAndSelect('appt.slot', 'slot')
        .where('appt.status IN (:...statuses)', {
          statuses: [AppointmentStatus.CONFIRMED, AppointmentStatus.REGISTERED],
        })
        .andWhere('appt.confirmation24hSentAt IS NULL')
        .andWhere('slot.slotDate = :slotDate', { slotDate: tomorrowDateStr })
        .getMany();

      this.logger.log(
        `Found ${appointments.length} appointments for 24h reminder.`,
      );

      for (const appointment of appointments) {
        try {
          const doctor = appointment.doctor as any;
          const doctorName = doctor
            ? `${doctor.firstName} ${doctor.lastName}`
            : 'Doctor';
          const slot = appointment.slot as any;
          const appointmentDate = slot ? slot.slotDate : '';
          const appointmentTime = slot ? slot.startTime : '';
          const patient = appointment.patient as any;

          await this.notificationsQueue.add(
            'send-whatsapp',
            {
              notificationLogId: `reminder-24h-${appointment.id}`,
              tenantId: appointment.tenantId,
              patientId: appointment.patientId,
              phone: patient?.phone,
              notificationType: 'APPOINTMENT_REMINDER_24H',
              payload: {
                patientName:
                  `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim(),
                doctorName,
                appointmentDate,
                appointmentTime,
                tokenNumber: appointment.tokenNumber,
                tenantId: appointment.tenantId,
                to: patient?.phone,
                type: 'APPOINTMENT_REMINDER_24H',
                data: {
                  patientName:
                    `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim(),
                  doctorName,
                  appointmentDate,
                  appointmentTime,
                  tokenNumber: String(appointment.tokenNumber),
                },
              },
            },
            {
              jobId: `24h-reminder-${appointment.id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          );

          await this.platformDs
            .getRepository(Appointment)
            .update(appointment.id, {
              confirmation24hSentAt: new Date(),
            });

          this.logger.log(
            `Queued 24h reminder for appointment ${appointment.id}`,
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to queue 24h reminder for appointment ${appointment.id}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`sendDailyReminders failed: ${err.message}`, err.stack);
    }
  }

  /**
   * Runs every 15 minutes.
   * Finds appointments scheduled between now+45min and now+75min that haven't had a 1h reminder.
   */
  @Cron('*/15 * * * *')
  async sendHourlyReminders() {
    this.logger.log('Running 1h appointment reminder check...');

    const now = new Date();
    const windowStart = addMinutes(now, 45);
    const windowEnd = addMinutes(now, 75);
    const windowDateStr = windowStart.toISOString().split('T')[0];

    try {
      const appointments = await this.platformDs
        .getRepository(Appointment)
        .createQueryBuilder('appt')
        .leftJoinAndSelect('appt.patient', 'patient')
        .leftJoinAndSelect('appt.doctor', 'doctor')
        .leftJoinAndSelect('appt.slot', 'slot')
        .where('appt.status = :status', { status: AppointmentStatus.CONFIRMED })
        .andWhere('appt.reminder1hSentAt IS NULL')
        .andWhere('slot.slotDate = :slotDate', { slotDate: windowDateStr })
        .getMany();

      const eligible = appointments.filter((appt) => {
        const slot = appt.slot as any;
        if (!slot) return false;
        const slotDateTime = this.buildSlotDateTime(
          slot.slotDate,
          slot.startTime,
        );
        return slotDateTime >= windowStart && slotDateTime <= windowEnd;
      });

      this.logger.log(`Found ${eligible.length} appointments for 1h reminder.`);

      for (const appointment of eligible) {
        try {
          const doctor = appointment.doctor as any;
          const doctorName = doctor
            ? `${doctor.firstName} ${doctor.lastName}`
            : 'Doctor';
          const slot = appointment.slot as any;
          const appointmentDate = slot ? slot.slotDate : '';
          const appointmentTime = slot ? slot.startTime : '';
          const patient = appointment.patient as any;

          await this.notificationsQueue.add(
            'send-whatsapp',
            {
              notificationLogId: `reminder-1h-${appointment.id}`,
              tenantId: appointment.tenantId,
              patientId: appointment.patientId,
              phone: patient?.phone,
              notificationType: 'APPOINTMENT_REMINDER_1H',
              payload: {
                patientName:
                  `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim(),
                doctorName,
                appointmentDate,
                appointmentTime,
                tokenNumber: String(appointment.tokenNumber),
                tenantId: appointment.tenantId,
                to: patient?.phone,
                type: 'APPOINTMENT_REMINDER_1H',
                data: {
                  patientName:
                    `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim(),
                  doctorName,
                  appointmentDate,
                  appointmentTime,
                  tokenNumber: String(appointment.tokenNumber),
                },
              },
            },
            {
              jobId: `1h-reminder-${appointment.id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          );

          await this.platformDs
            .getRepository(Appointment)
            .update(appointment.id, {
              reminder1hSentAt: new Date(),
            });

          this.logger.log(
            `Queued 1h reminder for appointment ${appointment.id}`,
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to queue 1h reminder for appointment ${appointment.id}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `sendHourlyReminders failed: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Runs every 5 minutes.
   * Checks IN_PROGRESS appointments per doctor, finds patient 3 positions ahead in queue,
   * sends "your turn soon" alert if not already sent.
   */
  @Cron('*/5 * * * *')
  async sendQueueAlerts() {
    this.logger.log('Running queue position alert check...');

    try {
      const today = new Date();
      const todayStart = startOfDay(today);
      const todayDateStr = today.toISOString().split('T')[0];

      const inProgressAppointments = await this.platformDs
        .getRepository(Appointment)
        .createQueryBuilder('appt')
        .leftJoinAndSelect('appt.slot', 'slot')
        .where('appt.status = :status', {
          status: AppointmentStatus.IN_PROGRESS,
        })
        .andWhere('slot.slotDate = :slotDate', { slotDate: todayDateStr })
        .getMany();

      const doctorIds = [
        ...new Set(inProgressAppointments.map((a) => a.doctorId)),
      ];

      for (const doctorId of doctorIds) {
        try {
          const inProgressAppt = inProgressAppointments.find(
            (a) => a.doctorId === doctorId,
          );
          if (!inProgressAppt) continue;

          const currentToken = inProgressAppt.tokenNumber;

          const upcomingAppointments = await this.platformDs
            .getRepository(Appointment)
            .createQueryBuilder('appt')
            .leftJoinAndSelect('appt.patient', 'patient')
            .leftJoinAndSelect('appt.slot', 'slot')
            .where('appt.doctorId = :doctorId', { doctorId })
            .andWhere('appt.tenantId = :tenantId', {
              tenantId: inProgressAppt.tenantId,
            })
            .andWhere('appt.status = :status', {
              status: AppointmentStatus.CHECKED_IN,
            })
            .andWhere('appt.tokenNumber > :currentToken', { currentToken })
            .andWhere('slot.slotDate = :slotDate', { slotDate: todayDateStr })
            .orderBy('appt.tokenNumber', 'ASC')
            .getMany();

          if (upcomingAppointments.length >= 3) {
            const targetAppointment = upcomingAppointments[2];

            // Dedup: check if QUEUE_ALERT already sent today for this appointment
            const alreadyAlerted = await this.platformDs
              .getRepository(NotificationLog)
              .createQueryBuilder('log')
              .where('log.tenantId = :tenantId', {
                tenantId: targetAppointment.tenantId,
              })
              .andWhere('log.patientId = :patientId', {
                patientId: targetAppointment.patientId,
              })
              .andWhere('log.notificationType = :type', { type: 'QUEUE_ALERT' })
              .andWhere('log.createdAt >= :since', { since: todayStart })
              .andWhere("log.payload->>'appointmentId' = :appointmentId", {
                appointmentId: targetAppointment.id,
              })
              .getOne();

            if (!alreadyAlerted) {
              const patient = targetAppointment.patient as any;

              await this.notificationsQueue.add(
                'send-whatsapp',
                {
                  notificationLogId: `queue-alert-${targetAppointment.id}`,
                  tenantId: targetAppointment.tenantId,
                  patientId: targetAppointment.patientId,
                  phone: patient?.phone,
                  notificationType: 'QUEUE_ALERT',
                  payload: {
                    patientName:
                      `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim(),
                    tokenNumber: String(targetAppointment.tokenNumber),
                    currentToken: String(currentToken),
                    appointmentId: targetAppointment.id,
                    tenantId: targetAppointment.tenantId,
                    to: patient?.phone,
                    type: 'QUEUE_ALERT',
                    data: {
                      patientName:
                        `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim(),
                      tokenNumber: String(targetAppointment.tokenNumber),
                      currentToken: String(currentToken),
                    },
                  },
                },
                {
                  jobId: `queue-alert-${targetAppointment.id}-${Date.now()}`,
                  attempts: 2,
                },
              );

              this.logger.log(
                `Queued QUEUE_ALERT for appointment ${targetAppointment.id} (token ${targetAppointment.tokenNumber}, current token ${currentToken})`,
              );
            }
          }
        } catch (err: any) {
          this.logger.error(
            `Queue alert failed for doctorId ${doctorId}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`sendQueueAlerts failed: ${err.message}`, err.stack);
    }
  }

  private buildSlotDateTime(slotDate: string, startTime: string): Date {
    const [hours, minutes] = startTime.split(':').map(Number);
    const dt = new Date(slotDate);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }
}
