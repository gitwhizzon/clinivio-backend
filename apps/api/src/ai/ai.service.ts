import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import {
  Patient,
  Consultation,
  LabOrder,
  TenantDataSourceRegistry,
} from '@mediflow/database';
import { AuditService } from '../audit/audit.service';

export const AI_REDIS_CLIENT = 'AI_REDIS_CLIENT';

// ── De-identified shape sent to Claude — NO PII ───────────────────────────────

interface AnonymisedVisit {
  daysAgo: number; // relative — not absolute date
  visitType: string; // OPD / IPD / EMERGENCY
  chiefComplaint?: string;
  diagnosis?: string;
  observations?: string;
  vitals?: {
    bp?: string;
    pulseRate?: number;
    temperature?: number;
    spo2?: number;
    weightKg?: number;
    bmi?: number;
    rbsMgDl?: number;
  };
  medications: Array<{
    name: string; // medicine name only — no patient identifiers
    dosage: string;
    frequency: string;
    duration: string;
  }>;
  labResults: Array<{
    test: string;
    result: string;
    unit?: string;
    flag?: string; // NORMAL | ABNORMAL | CRITICAL
  }>;
}

interface AnonymisedProfile {
  ageInYears: number; // computed from DOB — not the DOB itself
  sex: string;
  bloodGroup?: string; // clinical, not identifying
  visits: AnonymisedVisit[];
}

const CACHE_TTL_SECONDS = 86_400; // 24 h

const SYSTEM_PROMPT = `You are a clinical documentation assistant embedded in a hospital information system.
Your sole purpose is to produce a concise, structured clinical summary for physician review.

STRICT RULES:
1. You receive de-identified data only. Never attempt to infer or reconstruct patient identity.
2. Do not reference names, contact details, record numbers, or any personal identifiers.
3. Output only clinical insights — patterns, trends, concerns, and medication summary.
4. Use hedged language ("consistent with", "may suggest", "warrants monitoring").
5. Never make a definitive diagnosis.
6. Flag any ABNORMAL or CRITICAL lab values explicitly.
7. Identify recurring medications across visits.
8. Keep the total response under 400 words.
9. Use exactly this structure:

## Clinical Overview
[2–3 sentences describing the visit pattern and primary concerns]

## Key Clinical Concerns
[Bullet list of 3–5 concerns or findings worth monitoring]

## Medication Summary
[Bullet list: medication name — dosage — frequency — last prescribed]

## Trends & Alerts
[Notable vital or lab trends; flag any CRITICAL values]

## Suggested Follow-up Considerations
[1–3 clinical follow-up actions based solely on the data]

---
*AI-generated summary — for clinical reference only. Not a substitute for physician assessment.*`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private _client: Anthropic | null = null;

  constructor(
    @InjectDataSource() private readonly platformDs: DataSource,
    private readonly registry: TenantDataSourceRegistry,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(AI_REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private get client(): Anthropic {
    if (!this._client) {
      const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is not configured. Add it to your environment variables.',
        );
      }
      this._client = new Anthropic({ apiKey });
    }
    return this._client;
  }

  // ── Anonymiser — strips all PII before anything leaves the system ─────────────

  private anonymise(
    patient: Patient,
    consultations: Consultation[],
    labOrders: LabOrder[],
  ): AnonymisedProfile {
    const ageInYears = patient.dob
      ? Math.floor(
          (Date.now() - new Date(patient.dob).getTime()) /
            (365.25 * 24 * 3600 * 1000),
        )
      : 0;

    const ordersMap = new Map<string, LabOrder[]>();
    for (const o of labOrders) {
      if (!o.appointmentId) continue;
      if (!ordersMap.has(o.appointmentId)) ordersMap.set(o.appointmentId, []);
      ordersMap.get(o.appointmentId)!.push(o);
    }

    const now = Date.now();

    const visits: AnonymisedVisit[] = consultations.map((c) => {
      const visitDate = new Date(c.createdAt);
      const daysAgo = Math.floor(
        (now - visitDate.getTime()) / (24 * 3600 * 1000),
      );

      const medications = (c.prescriptions ?? []).flatMap((rx) =>
        (rx.items ?? []).map((item) => ({
          name: item.medicineName, // medicine name — not PII
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
        })),
      );

      const apptLabOrders = ordersMap.get(c.appointmentId ?? '') ?? [];
      const labResults = apptLabOrders.flatMap((o) =>
        (o.items ?? [])
          .filter((item) => item.result)
          .map((item) => ({
            test: item.labTest?.name ?? 'Unknown',
            result: item.result!,
            unit: item.unit ?? undefined,
            flag: item.flag ?? undefined,
          })),
      );

      const vitals: AnonymisedVisit['vitals'] = {};
      if (c.bpSystolic && c.bpDiastolic)
        vitals.bp = `${c.bpSystolic}/${c.bpDiastolic} mmHg`;
      if (c.pulseRate) vitals.pulseRate = c.pulseRate;
      if (c.temperature) vitals.temperature = Number(c.temperature);
      if (c.spo2) vitals.spo2 = c.spo2;
      if (c.weightKg) vitals.weightKg = Number(c.weightKg);
      if (c.bmi) vitals.bmi = Number(c.bmi);
      if (c.rbsMgDl) vitals.rbsMgDl = Number(c.rbsMgDl);

      return {
        daysAgo,
        visitType: c.appointment?.visitType ?? 'OPD',
        chiefComplaint: c.appointment?.chiefComplaint ?? undefined,
        diagnosis: c.diagnosis ?? undefined,
        observations: c.observations ?? undefined,
        vitals: Object.keys(vitals).length ? vitals : undefined,
        medications,
        labResults,
      };
    });

    return {
      ageInYears,
      sex: patient.gender ?? 'Unknown',
      bloodGroup: patient.bloodGroup ?? undefined,
      visits,
    };
  }

  // ── Output sanitiser — last-line defence against PII leaking back ─────────────

  private sanitiseOutput(text: string): string {
    // Strip anything that looks like a phone number, email, or UUID
    return text
      .replace(/\b\d{10,12}\b/g, '[REDACTED]')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED]')
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '[REDACTED]',
      );
  }

  // ── Main entry point ──────────────────────────────────────────────────────────

  async getSummary(
    patientId: string,
    tenantId: string,
    requestUserId: string,
    forceRefresh = false,
  ) {
    const cacheKey = `ai_summary:${tenantId}:${patientId}`;

    if (!forceRefresh) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return { ...JSON.parse(cached), fromCache: true };
      }
    }

    // Fetch clinical data from tenant DB — no PII fields beyond what anonymiser drops
    const tenantDs = await this.registry.getOrCreate(tenantId, '');
    const patient = await tenantDs.getRepository(Patient).findOne({
      where: { id: patientId, tenantId },
      select: ['id', 'dob', 'gender', 'bloodGroup'], // explicitly exclude name, phone, email, uhid
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const consultations = await tenantDs.getRepository(Consultation).find({
      where: { patientId, tenantId },
      relations: ['appointment', 'prescriptions', 'prescriptions.items'],
      order: { createdAt: 'DESC' },
      take: 20,
    });

    if (!consultations.length) {
      return {
        summary: null,
        reason: 'No consultation history available yet',
        fromCache: false,
      };
    }

    const apptIds = consultations
      .map((c) => c.appointmentId)
      .filter(Boolean) as string[];
    const labOrders = apptIds.length
      ? await tenantDs.getRepository(LabOrder).find({
          where: { appointmentId: In(apptIds) as any, tenantId },
          relations: ['items', 'items.labTest'],
        })
      : [];

    const anonymised = this.anonymise(patient, consultations, labOrders);

    // Build the user message — only de-identified clinical JSON
    const userMessage = `Generate a clinical summary for the following de-identified patient data:\n\n${JSON.stringify(anonymised, null, 2)}`;

    let rawSummary: string;
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001', // fast + cost-efficient for summaries
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      const block = response.content.find((b) => b.type === 'text');
      rawSummary = block?.type === 'text' ? block.text : '';
    } catch (err: any) {
      this.logger.error('[AI] Claude API call failed:', err?.message);
      throw err;
    }

    const summary = this.sanitiseOutput(rawSummary);

    const result = {
      summary,
      visitCount: consultations.length,
      generatedAt: new Date().toISOString(),
      fromCache: false,
    };

    await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));

    // Audit the AI call — no patient data in the log
    await this.audit.log({
      tenantId,
      userId: requestUserId,
      action: 'AI_SUMMARY',
      entityType: 'Patient',
      entityId: patientId,
      description: `AI clinical summary generated (${consultations.length} consultations analysed)`,
      metadata: {
        model: 'claude-haiku-4-5-20251001',
        visitCount: consultations.length,
      },
    });

    return result;
  }

  async invalidateCache(patientId: string, tenantId: string) {
    await this.redis.del(`ai_summary:${tenantId}:${patientId}`);
  }

  // ── AI prescription suggestions ───────────────────────────────────────────────

  async getPrescriptionSuggestions(params: {
    conditions: string[];
    diagnosis: string;
    observations?: string;
    ageInYears?: number;
    gender?: string;
  }) {
    const { conditions, diagnosis, observations, ageInYears, gender } = params;

    const prompt = `You are a clinical pharmacology assistant. A doctor needs prescription suggestions.

Patient profile (de-identified):
- Age: ${ageInYears ?? 'Unknown'} years
- Gender: ${gender ?? 'Unknown'}
- Chronic conditions: ${conditions.length ? conditions.join(', ') : 'None recorded'}
- Current diagnosis: ${diagnosis || 'Not specified'}
- Observations: ${observations || 'None'}

Suggest up to 5 appropriate medicines for the prescription. For each:
1. Use the generic name (INN)
2. Include typical adult dosage, frequency, and duration
3. Flag any important contraindications given the patient's conditions
4. Prefer first-line evidence-based options

Return ONLY a valid JSON array (no markdown, no explanation):
[{"name":"...","dosage":"...","frequency":"...","duration":"...","notes":"..."}]`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system:
          'You are a clinical pharmacology assistant. Return only valid JSON. No markdown code blocks.',
        messages: [{ role: 'user', content: prompt }],
      });

      const block = response.content.find((b) => b.type === 'text');
      const raw = block?.type === 'text' ? block.text.trim() : '[]';

      // Strip markdown code fences if model wraps the JSON
      const clean = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let suggestions: unknown[];
      try {
        suggestions = JSON.parse(clean);
        if (!Array.isArray(suggestions)) suggestions = [];
      } catch {
        suggestions = [];
      }

      return { suggestions: suggestions.slice(0, 5) };
    } catch (err: any) {
      this.logger.error('[AI] Prescription suggestions failed:', err?.message);
      return { suggestions: [] };
    }
  }

  // ── AI population-level insights for analytics ────────────────────────────────

  async getPopulationInsights(
    payload: {
      totalPatients: number;
      patientsWithConditionTags: number;
      conditionDistribution: Array<{
        condition: string;
        count: number;
        percentage: number;
      }>;
      topPrescribedMedicinesPerCondition: Array<{
        condition: string;
        topMedicines: string[];
      }>;
      scope?: string;
    },
    tenantId: string,
    requestUserId: string,
    overrideCacheKey?: string,
  ) {
    const cacheKey = overrideCacheKey ?? `ai_population_insights:${tenantId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return { ...JSON.parse(cached), fromCache: true };

    const userMessage = `Analyse this de-identified patient population data and generate actionable clinical insights for the medical team:

${JSON.stringify(payload, null, 2)}

Provide insights in exactly this structure:

## Population Overview
[2-3 sentences about the overall patient population composition]

## Key Clinical Patterns
[3-5 bullets: notable disease clustering, co-morbidity patterns, or prescription trends]

## High-Risk Groups
[2-3 bullets: conditions or combinations that may need proactive management]

## Prescription Intelligence
[2-3 bullets: interesting patterns in prescribing behaviour, potential optimisations]

## Recommended Focus Areas
[3 actionable recommendations for the clinical team based on these patterns]

---
*AI-generated population analysis — for clinical governance reference only.*`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system:
          'You are a medical analytics AI. Analyse population-level de-identified clinical data. Use hedged language. Never reference individual patients.',
        messages: [{ role: 'user', content: userMessage }],
      });

      const block = response.content.find((b) => b.type === 'text');
      const rawInsights = block?.type === 'text' ? block.text : '';
      const insights = this.sanitiseOutput(rawInsights);

      const result = {
        insights,
        generatedAt: new Date().toISOString(),
        fromCache: false,
      };

      // Cache for 6 hours
      await this.redis.setex(cacheKey, 21_600, JSON.stringify(result));

      await this.audit.log({
        tenantId,
        userId: requestUserId,
        action: 'AI_POPULATION_INSIGHTS',
        entityType: 'Tenant',
        entityId: tenantId,
        description: `AI population analytics generated for ${payload.totalPatients} patients`,
        metadata: { model: 'claude-haiku-4-5-20251001' },
      });

      return result;
    } catch (err: any) {
      this.logger.error('[AI] Population insights failed:', err?.message);
      throw err;
    }
  }
}
