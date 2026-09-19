import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  IPDAdmission,
  IPDVitalSnapshot,
  IPDTreatment,
  IPDProcedure,
  DischargeAdvice,
  DischargeSummary,
  Bed,
  Invoice,
  BedStatus,
  IPDAdmissionStatus,
  InvoiceType,
  PaymentStatus,
  TenantEntityManager,
} from '@mediflow/database';

export class AdmitPatientDto {
  @IsUUID() patientId: string;
  @IsUUID() attendingDoctorId: string;
  @IsUUID() bedId: string;
  @IsString() admissionReason: string;
  @IsOptional() @IsUUID() appointmentId?: string;
  @IsOptional() @IsString() referredBy?: string;
  @IsOptional() @IsString() opinionObtainedBy?: string;
  @IsOptional() @IsDateString() estimatedDischargeAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class AddVitalSnapshotDto {
  @IsOptional() @IsUUID() recordedById?: string;
  @IsOptional() @IsNumber() bpSystolic?: number;
  @IsOptional() @IsNumber() bpDiastolic?: number;
  @IsOptional() @IsNumber() pulseRate?: number;
  @IsOptional() @IsNumber() temperature?: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsNumber() heightCm?: number;
  @IsOptional() @IsNumber() spo2?: number;
  @IsOptional() @IsNumber() rbsMgDl?: number;
  @IsOptional() @IsNumber() respiratoryRate?: number;
  @IsOptional() @IsString() notes?: string;
}

export class AddTreatmentDto {
  @IsOptional() @IsUUID() orderedById?: string;
  @IsString() treatmentName: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() notes?: string;
}

export class AddProcedureDto {
  @IsOptional() @IsUUID() performedById?: string;
  @IsString() procedureName: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() outcomes?: string;
  @IsOptional() @IsString() complications?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
}

export class SaveDischargeAdviceDto {
  @IsOptional() @IsUUID() createdById?: string;
  @IsOptional() @IsString() medications?: string;
  @IsOptional() @IsString() dietAdvice?: string;
  @IsOptional() @IsString() activityAdvice?: string;
  @IsOptional() @IsString() woundCare?: string;
  @IsOptional() @IsString() otherAdvice?: string;
  @IsOptional() @IsDateString() followUpDate?: string;
  @IsOptional() @IsString() followUpNotes?: string;
}

export class SaveDischargeSummaryDto {
  @IsOptional() @IsUUID() generatedById?: string;
  @IsString() finalDiagnosis: string;
  @IsString() presentingComplaints: string;
  @IsString() treatmentSummary: string;
  @IsOptional() @IsString() proceduresDone?: string;
  @IsOptional() @IsString() investigationFindings?: string;
  @IsString() conditionAtDischarge: string;
  @IsOptional() @IsString() pdfS3Key?: string;
}

@Injectable()
export class IpdService {
  constructor(private readonly db: TenantEntityManager) {}

  private async generateAdmissionNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.db
      .repo(IPDAdmission)
      .count({ where: { tenantId } });
    return `IPD-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  private async loadAdmission(id: string) {
    return this.db.repo(IPDAdmission).findOne({
      where: { id },
      relations: [
        'patient',
        'attendingDoctor',
        'room',
        'bed',
        'vitalSnapshots',
        'treatments',
        'procedures',
        'dischargeAdvice',
        'dischargeSummary',
      ],
    });
  }

  async admitPatient(tenantId: string, dto: AdmitPatientDto) {
    return this.db.transaction(async (em) => {
      const admissionRepo = em.getRepository(IPDAdmission);
      const bedRepo = em.getRepository(Bed);

      const bed = await bedRepo.findOne({ where: { id: dto.bedId, tenantId } });
      if (!bed) throw new NotFoundException('Bed not found');
      if (bed.status !== BedStatus.AVAILABLE)
        throw new ConflictException('Bed is not available');

      const admissionNumber = await this.generateAdmissionNumber(tenantId);

      const admission = await admissionRepo.save(
        admissionRepo.create({
          tenantId,
          patientId: dto.patientId,
          attendingDoctorId: dto.attendingDoctorId,
          bedId: dto.bedId,
          roomId: bed.roomId,
          appointmentId: dto.appointmentId ?? null,
          admissionNumber,
          admissionReason: dto.admissionReason,
          referredBy: dto.referredBy ?? null,
          opinionObtainedBy: dto.opinionObtainedBy ?? null,
          estimatedDischargeAt: dto.estimatedDischargeAt
            ? new Date(dto.estimatedDischargeAt)
            : null,
          notes: dto.notes ?? null,
          status: IPDAdmissionStatus.ADMITTED,
          admittedAt: new Date(),
        }),
      );

      await bedRepo.update(dto.bedId, { status: BedStatus.OCCUPIED });

      // Create a pending admission invoice so billing counter can collect payment
      const invoiceCount = await em
        .getRepository(Invoice)
        .count({ where: { tenantId } });
      const invoiceNumber = `INV-IPD-${String(invoiceCount + 1).padStart(6, '0')}`;
      await em.getRepository(Invoice).save(
        em.getRepository(Invoice).create({
          tenantId,
          patientId: dto.patientId,
          ipdAdmissionId: admission.id,
          appointmentId: dto.appointmentId ?? null,
          invoiceNumber,
          invoiceType: InvoiceType.PACKAGE,
          lineItems: [
            { description: 'IPD Admission — Bed & Service Charges', amount: 0 },
          ],
          subtotal: '0',
          discountAmount: '0',
          taxableAmount: '0',
          cgstAmount: '0',
          sgstAmount: '0',
          igstAmount: '0',
          totalAmount: '0',
          paymentStatus: PaymentStatus.PENDING,
          notes: `Admission: ${admissionNumber}`,
        }),
      );

      return this.loadAdmission(admission.id);
    });
  }

  async findAll(
    tenantId: string,
    filters: { status?: IPDAdmissionStatus; patientId?: string },
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const qb = this.db
      .qb(IPDAdmission, 'adm')
      .leftJoinAndSelect('adm.patient', 'patient')
      .leftJoinAndSelect('adm.attendingDoctor', 'doctor')
      .leftJoinAndSelect('adm.room', 'room')
      .leftJoinAndSelect('adm.bed', 'bed')
      .where('adm.tenantId = :tenantId', { tenantId });

    if (filters.status)
      qb.andWhere('adm.status = :status', { status: filters.status });
    if (filters.patientId)
      qb.andWhere('adm.patientId = :patientId', {
        patientId: filters.patientId,
      });

    qb.orderBy('adm.admittedAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, tenantId: string) {
    const admission = await this.loadAdmission(id);
    if (!admission || admission.tenantId !== tenantId)
      throw new NotFoundException('Admission not found');
    return admission;
  }

  async markReadyForDischarge(id: string, tenantId: string) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');
    if (admission.status === IPDAdmissionStatus.DISCHARGED)
      throw new BadRequestException('Patient already discharged');
    await this.db
      .repo(IPDAdmission)
      .update(id, { status: IPDAdmissionStatus.READY_FOR_DISCHARGE });
    return this.loadAdmission(id);
  }

  async dischargePatient(id: string, tenantId: string) {
    return this.db.transaction(async (em) => {
      const admissionRepo = em.getRepository(IPDAdmission);
      const bedRepo = em.getRepository(Bed);

      const admission = await admissionRepo.findOne({
        where: { id, tenantId },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      if (admission.status === IPDAdmissionStatus.DISCHARGED)
        throw new BadRequestException('Patient already discharged');

      await admissionRepo.update(id, {
        status: IPDAdmissionStatus.DISCHARGED,
        dischargedAt: new Date(),
      });
      await bedRepo.update(admission.bedId, { status: BedStatus.AVAILABLE });

      return this.loadAdmission(id);
    });
  }

  async addVitalSnapshot(
    admissionId: string,
    tenantId: string,
    dto: AddVitalSnapshotDto,
  ) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');

    let bmi: string | undefined;
    if (dto.weightKg && dto.heightCm) {
      const hM = dto.heightCm / 100;
      bmi = (dto.weightKg / (hM * hM)).toFixed(1);
    }

    return this.db.repo(IPDVitalSnapshot).save(
      this.db.repo(IPDVitalSnapshot).create({
        tenantId,
        admissionId,
        recordedById: dto.recordedById,
        bpSystolic: dto.bpSystolic ?? null,
        bpDiastolic: dto.bpDiastolic ?? null,
        pulseRate: dto.pulseRate ?? null,
        temperature:
          dto.temperature !== undefined ? String(dto.temperature) : null,
        weightKg: dto.weightKg !== undefined ? String(dto.weightKg) : null,
        heightCm: dto.heightCm !== undefined ? String(dto.heightCm) : null,
        bmi: bmi ?? null,
        spo2: dto.spo2 ?? null,
        rbsMgDl: dto.rbsMgDl !== undefined ? String(dto.rbsMgDl) : null,
        respiratoryRate: dto.respiratoryRate ?? null,
        notes: dto.notes ?? null,
        recordedAt: new Date(),
      }),
    );
  }

  async getVitals(admissionId: string, tenantId: string) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');
    return this.db
      .repo(IPDVitalSnapshot)
      .find({
        where: { admissionId },
        relations: ['recordedBy'],
        order: { recordedAt: 'DESC' },
      });
  }

  async addTreatment(
    admissionId: string,
    tenantId: string,
    dto: AddTreatmentDto,
  ) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');

    return this.db.repo(IPDTreatment).save(
      this.db.repo(IPDTreatment).create({
        tenantId,
        admissionId,
        orderedById: dto.orderedById,
        treatmentName: dto.treatmentName,
        instructions: dto.instructions ?? null,
        notes: dto.notes ?? null,
        startedAt: new Date(),
        isActive: true,
      }),
    );
  }

  async endTreatment(treatmentId: string, tenantId: string) {
    const treatment = await this.db
      .repo(IPDTreatment)
      .findOne({ where: { id: treatmentId, tenantId } });
    if (!treatment) throw new NotFoundException('Treatment not found');
    await this.db
      .repo(IPDTreatment)
      .update(treatmentId, { isActive: false, endedAt: new Date() });
    return this.db.repo(IPDTreatment).findOne({ where: { id: treatmentId } });
  }

  async getTreatments(admissionId: string, tenantId: string) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');
    return this.db
      .repo(IPDTreatment)
      .find({
        where: { admissionId },
        relations: ['orderedBy'],
        order: { startedAt: 'DESC' },
      });
  }

  async addProcedure(
    admissionId: string,
    tenantId: string,
    dto: AddProcedureDto,
  ) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');

    return this.db.repo(IPDProcedure).save(
      this.db.repo(IPDProcedure).create({
        tenantId,
        admissionId,
        performedById: dto.performedById,
        procedureName: dto.procedureName,
        notes: dto.notes ?? null,
        outcomes: dto.outcomes ?? null,
        complications: dto.complications ?? null,
        photoUrls: dto.photoUrls ?? [],
        performedAt: new Date(),
      }),
    );
  }

  async addProcedurePhotos(
    procedureId: string,
    tenantId: string,
    photoUrls: string[],
  ) {
    const procedure = await this.db
      .repo(IPDProcedure)
      .findOne({ where: { id: procedureId, tenantId } });
    if (!procedure) throw new NotFoundException('Procedure not found');
    const updatedUrls = [...(procedure.photoUrls ?? []), ...photoUrls];
    await this.db
      .repo(IPDProcedure)
      .update(procedureId, { photoUrls: updatedUrls });
    return this.db.repo(IPDProcedure).findOne({ where: { id: procedureId } });
  }

  async getProcedures(admissionId: string, tenantId: string) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');
    return this.db
      .repo(IPDProcedure)
      .find({
        where: { admissionId },
        relations: ['performedBy'],
        order: { performedAt: 'DESC' },
      });
  }

  async saveDischargeAdvice(
    admissionId: string,
    tenantId: string,
    dto: SaveDischargeAdviceDto,
  ) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');

    const advice = await this.db
      .repo(DischargeAdvice)
      .findOne({ where: { admissionId } });

    const adviceData = {
      createdById: dto.createdById,
      medications: dto.medications ?? null,
      dietAdvice: dto.dietAdvice ?? null,
      activityAdvice: dto.activityAdvice ?? null,
      woundCare: dto.woundCare ?? null,
      otherAdvice: dto.otherAdvice ?? null,
      followUpDate: dto.followUpDate ?? null,
      followUpNotes: dto.followUpNotes ?? null,
    };

    if (advice) {
      await this.db.repo(DischargeAdvice).update(advice.id, adviceData);
      return this.db
        .repo(DischargeAdvice)
        .findOne({ where: { id: advice.id } });
    } else {
      return this.db
        .repo(DischargeAdvice)
        .save(
          this.db
            .repo(DischargeAdvice)
            .create({ tenantId, admissionId, ...adviceData }),
        );
    }
  }

  async saveDischargeSummary(
    admissionId: string,
    tenantId: string,
    dto: SaveDischargeSummaryDto,
  ) {
    const admission = await this.db
      .repo(IPDAdmission)
      .findOne({ where: { id: admissionId, tenantId } });
    if (!admission) throw new NotFoundException('Admission not found');

    const summary = await this.db
      .repo(DischargeSummary)
      .findOne({ where: { admissionId } });

    const summaryData = {
      generatedById: dto.generatedById,
      finalDiagnosis: dto.finalDiagnosis,
      presentingComplaints: dto.presentingComplaints,
      treatmentSummary: dto.treatmentSummary,
      proceduresDone: dto.proceduresDone ?? null,
      investigationFindings: dto.investigationFindings ?? null,
      conditionAtDischarge: dto.conditionAtDischarge,
      pdfS3Key: dto.pdfS3Key ?? null,
    };

    if (summary) {
      await this.db.repo(DischargeSummary).update(summary.id, summaryData);
      return this.db
        .repo(DischargeSummary)
        .findOne({ where: { id: summary.id } });
    } else {
      return this.db
        .repo(DischargeSummary)
        .save(
          this.db
            .repo(DischargeSummary)
            .create({
              tenantId,
              admissionId,
              ...summaryData,
              generatedAt: new Date(),
            }),
        );
    }
  }
}
