/**
 * Maps a NotificationLog.notificationType to the pre-approved WhatsApp
 * template that sends it. Deliberately conservative: the approved-templates
 * doc this was built from showed 9 of 12 use cases reusing the exact same
 * "appointment_reminder_2" template name+params — almost certainly meaning
 * those 9 don't actually have their own distinct approved template yet, not
 * that they're all meant to literally say "here's your appointment
 * reminder" for a cancellation or a payment confirmation. Only wiring the
 * three that have an unambiguous, distinct approved template. Adding a new
 * one later is exactly one entry here — see the bottom of this file.
 */

export interface WhatsappTemplateComponent {
  type: 'header' | 'body';
  parameters: Array<{ type: 'text' | 'document'; text?: string; document?: { id: string; filename?: string } }>;
}

export interface WhatsappTemplateConfig {
  templateName: string;
  languageCode: string;
  buildComponents: (payload: Record<string, any>) => WhatsappTemplateComponent[];
}

function text(value: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: String(value ?? '') };
}

export const WHATSAPP_TEMPLATES: Record<string, WhatsappTemplateConfig> = {
  PATIENT_REGISTRATION_CONFIRMED: {
    templateName: 'patient_registration_confirmed',
    languageCode: 'en',
    buildComponents: (p) => {
      const d = p.data ?? p;
      return [
        {
          type: 'body',
          parameters: [text(d.patientName), text(d.hospitalName), text(d.uhid), text(d.date)],
        },
      ];
    },
  },

  // Both 24h and 1h pre-visit reminders use the same approved template —
  // only the lead time differs, not the message content.
  APPOINTMENT_REMINDER_24H: {
    templateName: 'appointment_reminder_2',
    languageCode: 'en',
    buildComponents: (p) => {
      const d = p.data ?? p;
      return [
        {
          type: 'body',
          parameters: [text(d.patientName), text(d.doctorName), text(d.appointmentDate), text(d.appointmentTime)],
        },
      ];
    },
  },
  APPOINTMENT_REMINDER_1H: {
    templateName: 'appointment_reminder_2',
    languageCode: 'en',
    buildComponents: (p) => {
      const d = p.data ?? p;
      return [
        {
          type: 'body',
          parameters: [text(d.patientName), text(d.doctorName), text(d.appointmentDate), text(d.appointmentTime)],
        },
      ];
    },
  },

  // No PDF report-generation exists yet (see clinivio-backend's lab module —
  // no PDFKit/puppeteer anywhere), so this degrades gracefully: sends the
  // template without the header document component rather than failing,
  // if the caller didn't supply a mediaId (from WhatsappService.uploadMedia).
  LAB_REPORT_AVAILABLE: {
    templateName: 'lab_report_available',
    languageCode: 'en',
    buildComponents: (p) => {
      const d = p.data ?? p;
      const components: WhatsappTemplateComponent[] = [];
      if (d.mediaId) {
        components.push({
          type: 'header',
          parameters: [{ type: 'document', document: { id: d.mediaId, filename: 'report.pdf' } }],
        });
      }
      components.push({
        type: 'body',
        parameters: [text(d.patientName), text(d.uhid), text(d.testName), text(d.date), text(d.reportNumber)],
      });
      return components;
    },
  },

  // ── Not wired yet — no distinct approved template confirmed for these.
  // Add an entry here (and a trigger call-site) once the client confirms
  // real template names for: APPOINTMENT_CONFIRMED, APPOINTMENT_CANCELLED,
  // APPOINTMENT_DELAY, APPOINTMENT_RESCHEDULED, MEDICINE_REMINDER,
  // PRESCRIPTION_AVAILABLE, LAB_TEST_BOOKING_CONFIRMATION,
  // PAYMENT_CONFIRMATION. QUEUE_ALERT also has no approved template at all
  // (it wasn't in the original 12) — the processor logs and skips it rather
  // than guessing a template name.
};
