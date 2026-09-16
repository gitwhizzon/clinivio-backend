import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
  Patient,
  Prescription,
  Consultation,
  Appointment,
  LabOrder,
  TenantEntityManager,
} from '@mediflow/database';
import { AiService } from '../ai/ai.service';

export const COMMON_CONDITIONS = [
  'Diabetic (Type 1)',
  'Diabetic (Type 2)',
  'Pre-Diabetic',
  'Hypertension',
  'Hypotension',
  'Anemia (Iron Deficiency)',
  'Anemia (Megaloblastic)',
  'Asthma',
  'COPD',
  'Bronchitis',
  'CKD (Chronic Kidney Disease)',
  'AKI',
  'CAD (Coronary Artery Disease)',
  'Heart Failure',
  'Arrhythmia',
  'Thyroid (Hypothyroid)',
  'Thyroid (Hyperthyroid)',
  'Obesity',
  'Underweight',
  'Anxiety',
  'Depression',
  'Bipolar Disorder',
  'Arthritis (Rheumatoid)',
  'Arthritis (Osteo)',
  'Gout',
  'Migraine',
  'Epilepsy',
  "Parkinson's",
  'Liver Disease (NAFLD)',
  'Liver Disease (Cirrhosis)',
  'Hepatitis B',
  'Hepatitis C',
  'Cancer',
  'Stroke / TIA',
  'Pregnancy',
  'Post-Surgical',
  'Immunocompromised',
  'Dengue',
  'Malaria',
  'Typhoid',
  'TB',
  'Sickle Cell',
  'Thalassemia',
  'Psoriasis',
  'Eczema',
  'PCOD / PCOS',
  'Endometriosis',
  'Glaucoma',
  'Cataracts',
  'Diabetic Retinopathy',
];

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly db: TenantEntityManager,
    private readonly ai: AiService,
  ) {}

  // ── Doctor-scoped patient ID list ─────────────────────────────────────────────

  private async getDoctorPatientIds(
    tenantId: string,
    doctorId: string,
  ): Promise<string[]> {
    const appts = await this.db.repo(Appointment).find({
      where: { tenantId, doctorId },
      select: ['patientId'],
    });
    return [...new Set(appts.map((a) => a.patientId))];
  }

  // ── Doctor stats (for "My Analytics" view) ────────────────────────────────────

  async getDoctorStats(tenantId: string, doctorId: string) {
    const [totalConsultations, totalPrescriptions, appts] = await Promise.all([
      this.db.repo(Consultation).count({ where: { tenantId, doctorId } }),
      this.db.repo(Prescription).count({ where: { tenantId, doctorId } }),
      this.db.repo(Appointment).find({
        where: { tenantId, doctorId },
        select: ['patientId'],
      }),
    ]);
    const uniquePatients = new Set(appts.map((a) => a.patientId)).size;
    return { totalConsultations, totalPrescriptions, uniquePatients };
  }

  // ── Condition distribution ────────────────────────────────────────────────────

  async getConditionDistribution(tenantId: string, doctorId?: string) {
    let scopedIds: string[] | undefined;
    if (doctorId) {
      scopedIds = await this.getDoctorPatientIds(tenantId, doctorId);
      if (!scopedIds.length)
        return { totalPatients: 0, patientsTagged: 0, distribution: [] };
    }

    const patientWhere: any = { tenantId, isActive: true };
    if (scopedIds) patientWhere.id = In(scopedIds);

    const patients = await this.db.repo(Patient).find({
      where: patientWhere,
      select: ['id', 'conditions'] as any,
    });

    const counts: Record<string, number> = {};
    for (const p of patients) {
      for (const c of p.conditions ?? []) {
        if (c) counts[c] = (counts[c] ?? 0) + 1;
      }
    }

    const total = patients.length || 1;
    return {
      totalPatients: patients.length,
      patientsTagged: patients.filter((p) => (p.conditions ?? []).length > 0)
        .length,
      distribution: Object.entries(counts)
        .map(([condition, count]) => ({
          condition,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  // ── Top prescribed medicines per condition ────────────────────────────────────

  async getMedicinePatterns(
    tenantId: string,
    condition?: string,
    doctorId?: string,
  ) {
    let scopedIds: string[] | undefined;
    if (doctorId) {
      scopedIds = await this.getDoctorPatientIds(tenantId, doctorId);
      if (!scopedIds.length)
        return {
          condition: condition ?? 'All',
          patientCount: 0,
          medicines: [],
        };
    }

    const patientWhere2: any = { tenantId, isActive: true };
    if (scopedIds) patientWhere2.id = In(scopedIds);

    const patients = await this.db.repo(Patient).find({
      where: patientWhere2,
      select: ['id', 'conditions'] as any,
    });

    const targetIds = condition
      ? patients
          .filter((p) => (p.conditions ?? []).includes(condition))
          .map((p) => p.id)
      : patients.map((p) => p.id);

    if (!targetIds.length)
      return { condition: condition ?? 'All', medicines: [] };

    const prescriptionWhere: any = { tenantId, patientId: In(targetIds) };
    if (doctorId) prescriptionWhere.doctorId = doctorId;

    const prescriptions = await this.db.repo(Prescription).find({
      where: prescriptionWhere,
      relations: ['items'],
    });

    const medicineCounts: Record<string, number> = {};
    for (const rx of prescriptions) {
      for (const item of rx.items ?? []) {
        const name = item.medicineName.trim();
        if (name) medicineCounts[name] = (medicineCounts[name] ?? 0) + 1;
      }
    }

    const medicines = Object.entries(medicineCounts)
      .map(([medicine, count]) => ({ medicine, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return {
      condition: condition ?? 'All',
      patientCount: targetIds.length,
      medicines,
    };
  }

  // ── Vital trends for a condition ──────────────────────────────────────────────

  async getVitalTrends(tenantId: string, condition: string, doctorId?: string) {
    let scopedIds: string[] | undefined;
    if (doctorId) {
      scopedIds = await this.getDoctorPatientIds(tenantId, doctorId);
      if (!scopedIds.length)
        return {
          condition,
          patientCount: 0,
          consultationCount: 0,
          averageVitals: {},
        };
    }

    const patientWhere3: any = { tenantId, isActive: true };
    if (scopedIds) patientWhere3.id = In(scopedIds);

    const patients = await this.db.repo(Patient).find({
      where: patientWhere3,
      select: ['id', 'conditions'] as any,
    });

    const targetIds = patients
      .filter((p) => (p.conditions ?? []).includes(condition))
      .map((p) => p.id);

    if (!targetIds.length)
      return {
        condition,
        patientCount: 0,
        consultationCount: 0,
        averageVitals: {},
      };

    const consultationWhere: any = { tenantId, patientId: In(targetIds) };
    if (doctorId) consultationWhere.doctorId = doctorId;

    const consultations = await this.db.repo(Consultation).find({
      where: consultationWhere,
      select: [
        'bpSystolic',
        'bpDiastolic',
        'pulseRate',
        'spo2',
        'rbsMgDl',
        'bmi',
      ],
    });

    const sum = {
      bpSystolic: 0,
      bpDiastolic: 0,
      pulseRate: 0,
      spo2: 0,
      rbsMgDl: 0,
      bmi: 0,
    };
    const cnt = {
      bpSystolic: 0,
      bpDiastolic: 0,
      pulseRate: 0,
      spo2: 0,
      rbsMgDl: 0,
      bmi: 0,
    };

    for (const c of consultations) {
      if (c.bpSystolic) {
        sum.bpSystolic += c.bpSystolic;
        cnt.bpSystolic++;
      }
      if (c.bpDiastolic) {
        sum.bpDiastolic += c.bpDiastolic;
        cnt.bpDiastolic++;
      }
      if (c.pulseRate) {
        sum.pulseRate += c.pulseRate;
        cnt.pulseRate++;
      }
      if (c.spo2) {
        sum.spo2 += c.spo2;
        cnt.spo2++;
      }
      if (c.rbsMgDl) {
        sum.rbsMgDl += Number(c.rbsMgDl);
        cnt.rbsMgDl++;
      }
      if (c.bmi) {
        sum.bmi += Number(c.bmi);
        cnt.bmi++;
      }
    }

    const avg = (key: keyof typeof sum) =>
      cnt[key] > 0 ? Math.round((sum[key] / cnt[key]) * 10) / 10 : null;

    return {
      condition,
      patientCount: targetIds.length,
      consultationCount: consultations.length,
      averageVitals: {
        bpSystolic: avg('bpSystolic'),
        bpDiastolic: avg('bpDiastolic'),
        pulseRate: avg('pulseRate'),
        spo2: avg('spo2'),
        rbsMgDl: avg('rbsMgDl'),
        bmi: avg('bmi'),
      },
    };
  }

  // ── AI population insights ─────────────────────────────────────────────────────

  async getAiInsights(
    tenantId: string,
    requestUserId: string,
    doctorId?: string,
  ) {
    const { totalPatients, patientsTagged, distribution } =
      await this.getConditionDistribution(tenantId, doctorId);

    const topConditions = distribution.slice(0, 8);

    const topMeds: Array<{ condition: string; topMedicines: string[] }> = [];
    for (const { condition } of topConditions.slice(0, 5)) {
      const { medicines } = await this.getMedicinePatterns(
        tenantId,
        condition,
        doctorId,
      );
      topMeds.push({
        condition,
        topMedicines: medicines.slice(0, 5).map((m) => m.medicine),
      });
    }

    const payload = {
      totalPatients,
      patientsWithConditionTags: patientsTagged,
      conditionDistribution: topConditions,
      topPrescribedMedicinesPerCondition: topMeds,
      scope: doctorId ? "doctor's own patients" : 'entire hospital',
    };

    const cacheKey = doctorId
      ? `ai_population_insights:${tenantId}:${doctorId}`
      : undefined;
    return this.ai.getPopulationInsights(
      payload,
      tenantId,
      requestUserId,
      cacheKey,
    );
  }

  // ── AI prescription suggestions ───────────────────────────────────────────────

  async getPrescriptionSuggestions(
    patientId: string,
    tenantId: string,
    conditions: string[],
    diagnosis: string,
    observations?: string,
    ageInYears?: number,
    gender?: string,
  ) {
    return this.ai.getPrescriptionSuggestions({
      conditions,
      diagnosis,
      observations,
      ageInYears,
      gender,
    });
  }

  // ── Lab summary analytics ─────────────────────────────────────────────────────

  async getLabSummary(tenantId: string, doctorId?: string, days = 90) {
    let scopedIds: string[] | undefined;
    if (doctorId) {
      scopedIds = await this.getDoctorPatientIds(tenantId, doctorId);
      if (!scopedIds.length)
        return {
          totalOrders: 0,
          completedOrders: 0,
          completionRate: 0,
          abnormalCount: 0,
          abnormalRate: 0,
          topTests: [],
          dailyVolume: [],
        };
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const orderWhere: any = { tenantId };
    if (scopedIds) orderWhere.patientId = In(scopedIds);

    const orders = await this.db.repo(LabOrder).find({
      where: orderWhere,
      relations: ['items', 'items.labTest'],
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    const inPeriod = orders.filter((o) => new Date(o.createdAt) >= since);
    const totalOrders = inPeriod.length;
    const completedOrders = inPeriod.filter(
      (o) => o.status === 'COMPLETED',
    ).length;
    const completionRate =
      totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

    const allItems = inPeriod.flatMap((o) => o.items ?? []);
    const withResults = allItems.filter((i) => i.result);
    const abnormalCount = withResults.filter(
      (i) => i.flag === 'ABNORMAL' || i.flag === 'CRITICAL',
    ).length;
    const abnormalRate =
      withResults.length > 0
        ? Math.round((abnormalCount / withResults.length) * 100)
        : 0;

    const testCounts: Record<string, number> = {};
    for (const item of allItems) {
      const name = (item as any).labTest?.name ?? 'Unknown';
      testCounts[name] = (testCounts[name] ?? 0) + 1;
    }
    const topTests = Object.entries(testCounts)
      .map(([test, count]) => ({ test, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const dailyCounts: Record<string, number> = {};
    for (const o of inPeriod) {
      const date = new Date(o.createdAt).toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] ?? 0) + 1;
    }
    const dailyVolume = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalOrders,
      completedOrders,
      completionRate,
      abnormalCount,
      abnormalRate,
      topTests,
      dailyVolume,
    };
  }

  // ── Single-patient vitals + lab trend ────────────────────────────────────────

  async getPatientTrends(patientId: string, tenantId: string) {
    const [consultations, labOrders] = await Promise.all([
      this.db.repo(Consultation).find({
        where: { patientId, tenantId },
        select: [
          'createdAt',
          'bpSystolic',
          'bpDiastolic',
          'pulseRate',
          'spo2',
          'bmi',
          'temperature',
          'weightKg',
          'rbsMgDl',
        ] as any,
        order: { createdAt: 'ASC' },
        take: 60,
      }),
      this.db.repo(LabOrder).find({
        where: { patientId, tenantId },
        relations: ['items', 'items.labTest'],
        order: { createdAt: 'ASC' },
        take: 60,
      }),
    ]);

    const vitals = consultations.map((c) => ({
      date: new Date(c.createdAt).toISOString().split('T')[0],
      bpSystolic: c.bpSystolic ?? null,
      bpDiastolic: c.bpDiastolic ?? null,
      pulseRate: c.pulseRate ?? null,
      spo2: c.spo2 ?? null,
      bmi: c.bmi ? Number(c.bmi) : null,
      rbsMgDl: c.rbsMgDl ? Number(c.rbsMgDl) : null,
      temperature: c.temperature ? Number(c.temperature) : null,
      weightKg: c.weightKg ? Number(c.weightKg) : null,
    }));

    const labResults = labOrders
      .flatMap((o) =>
        (o.items ?? [])
          .filter((i: any) => i.result)
          .map((i: any) => ({
            date: new Date(o.createdAt).toISOString().split('T')[0],
            orderNumber: o.orderNumber,
            test: i.labTest?.name ?? 'Unknown',
            result: i.result,
            unit: i.unit ?? i.labTest?.unit ?? '',
            normalRange: i.normalRange ?? i.labTest?.normalRange ?? '',
            flag: i.flag ?? null,
          })),
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    return { vitals, labResults };
  }

  // ── Age distribution ──────────────────────────────────────────────────────────

  async getAgeDistribution(tenantId: string, doctorId?: string) {
    let scopedIds: string[] | undefined;
    if (doctorId) {
      scopedIds = await this.getDoctorPatientIds(tenantId, doctorId);
    }

    const patientWhere: any = { tenantId, isActive: true };
    if (scopedIds) patientWhere.id = In(scopedIds);

    const patients = await this.db.repo(Patient).find({
      where: patientWhere,
      select: ['id', 'dob'] as any,
    });

    const buckets: Record<string, number> = {
      '0–18': 0,
      '19–30': 0,
      '31–45': 0,
      '46–60': 0,
      '61–75': 0,
      '76+': 0,
    };

    const now = Date.now();
    let unknownCount = 0;
    for (const p of patients) {
      if (!p.dob) {
        unknownCount++;
        continue;
      }
      const age = Math.floor(
        (now - new Date(p.dob).getTime()) / (365.25 * 24 * 3600 * 1000),
      );
      if (age <= 18) buckets['0–18']++;
      else if (age <= 30) buckets['19–30']++;
      else if (age <= 45) buckets['31–45']++;
      else if (age <= 60) buckets['46–60']++;
      else if (age <= 75) buckets['61–75']++;
      else buckets['76+']++;
    }

    return {
      totalPatients: patients.length,
      unknownAge: unknownCount,
      distribution: Object.entries(buckets).map(([ageGroup, count]) => ({
        ageGroup,
        count,
        percentage: patients.length
          ? Math.round((count / patients.length) * 100)
          : 0,
      })),
    };
  }
}
