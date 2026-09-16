import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  Patient,
  PatientFamily,
  Consultation,
  LabOrder,
  TenantEntityManager,
  ILike,
  In,
} from '@mediflow/database';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { KAFKA_TOPICS } from '@mediflow/shared';

const PATIENT_SELECT: (keyof Patient)[] = [
  'id',
  'tenantId',
  'familyId',
  'uhid',
  'firstName',
  'lastName',
  'phone',
  'whatsappPhone',
  'hasWhatsapp',
  'email',
  'dob',
  'gender',
  'bloodGroup',
  'abhaId',
  'preferredLanguage',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'consentGivenAt',
  'isActive',
  'createdAt',
  'conditions',
];

@Injectable()
export class PatientsService {
  constructor(
    private readonly db: TenantEntityManager,
    private kafka: KafkaProducerService,
  ) {}

  private async generateUHID(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.db.repo(Patient).count({ where: { tenantId } });
    return `MF-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  async create(tenantId: string, dto: CreatePatientDto) {
    let familyId = dto.familyId;
    const whatsappPhone = dto.whatsappPhone || dto.phone;

    if (!familyId && whatsappPhone) {
      let family = await this.db.repo(PatientFamily).findOne({
        where: { tenantId, whatsappPhone },
      });
      if (!family) {
        family = await this.db
          .repo(PatientFamily)
          .save(
            this.db.repo(PatientFamily).create({ tenantId, whatsappPhone }),
          );
      }
      familyId = family.id;
    }

    const uhid = await this.generateUHID(tenantId);
    const patient = await this.db.repo(Patient).save(
      this.db.repo(Patient).create({
        tenantId,
        familyId,
        uhid,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        whatsappPhone,
        hasWhatsapp: dto.hasWhatsapp ?? true,
        email: dto.email,
        dob: dto.dob ?? null,
        gender: dto.gender as any,
        bloodGroup: dto.bloodGroup,
        abhaId: dto.abhaId,
        preferredLanguage: (dto.preferredLanguage as any) ?? 'EN',
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        consentGivenAt: dto.consentGiven ? new Date() : null,
        consentVersion: dto.consentGiven ? '1.0' : null,
      }),
    );

    // Set as primary patient if family has none
    await this.db
      .repo(PatientFamily)
      .createQueryBuilder()
      .update()
      .set({ primaryPatientId: patient.id })
      .where('id = :id AND primary_patient_id IS NULL', { id: familyId })
      .execute();

    await this.kafka.emit(KAFKA_TOPICS.PATIENT_REGISTERED, {
      eventId: uuidv4(),
      eventType: 'patient.registered',
      tenantId,
      timestamp: new Date().toISOString(),
      data: {
        patientId: patient.id,
        tenantId,
        phone: patient.phone,
        whatsappPhone: patient.whatsappPhone,
        hasWhatsapp: patient.hasWhatsapp,
        familyId: patient.familyId,
        name: `${patient.firstName} ${patient.lastName ?? ''}`.trim(),
        uhid: patient.uhid,
        preferredLanguage: patient.preferredLanguage,
      },
    });

    return patient;
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.db.repo(Patient).findAndCount({
      where: { tenantId, isActive: true },
      select: PATIENT_SELECT,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, tenantId: string) {
    const patient = await this.db.repo(Patient).findOne({
      where: { id, tenantId },
      relations: ['family'],
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async findByPhone(phone: string, tenantId: string) {
    const patient = await this.db.repo(Patient).findOne({
      where: [
        { phone, tenantId },
        { whatsappPhone: phone, tenantId },
      ],
      select: PATIENT_SELECT,
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async findByFamily(familyId: string, tenantId: string) {
    const members = await this.db.repo(Patient).find({
      where: { familyId, tenantId, isActive: true },
      select: PATIENT_SELECT,
      order: { createdAt: 'ASC' },
    });
    if (!members.length) throw new NotFoundException('Family group not found');
    return members;
  }

  async findFamilyByWhatsapp(whatsappPhone: string, tenantId: string) {
    const family = await this.db.repo(PatientFamily).findOne({
      where: { whatsappPhone, tenantId },
      relations: ['patients'],
    });
    if (!family)
      throw new NotFoundException('No family found for this WhatsApp number');
    return family;
  }

  async search(tenantId: string, q: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.db.repo(Patient).findAndCount({
      where: [
        { tenantId, isActive: true, firstName: ILike(`%${q}%`) },
        { tenantId, isActive: true, lastName: ILike(`%${q}%`) },
        { tenantId, isActive: true, phone: ILike(`%${q}%`) },
        { tenantId, isActive: true, uhid: ILike(`%${q}%`) },
        { tenantId, isActive: true, email: ILike(`%${q}%`) },
      ],
      select: PATIENT_SELECT,
      skip,
      take: limit,
    });
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, tenantId: string, dto: UpdatePatientDto) {
    await this.findById(id, tenantId);
    await this.db.repo(Patient).update(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      dob: dto.dob ?? undefined,
      gender: dto.gender as any,
      bloodGroup: dto.bloodGroup,
      preferredLanguage: dto.preferredLanguage as any,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      address: dto.address,
      hasWhatsapp: dto.hasWhatsapp,
      whatsappPhone: dto.whatsappPhone,
    });
    return this.findById(id, tenantId);
  }

  async updateConsent(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    await this.db
      .repo(Patient)
      .update(id, { consentGivenAt: new Date(), consentVersion: '1.0' });
    return this.findById(id, tenantId);
  }

  async updateConditions(id: string, tenantId: string, conditions: string[]) {
    await this.findById(id, tenantId);
    const clean = [...new Set(conditions.map((c) => c.trim()).filter(Boolean))];
    await this.db.repo(Patient).update(id, { conditions: clean });
    return this.findById(id, tenantId);
  }

  async getConsultationHistory(
    patientId: string,
    tenantId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const [consultations] = await this.db.repo(Consultation).findAndCount({
      where: { patientId, tenantId },
      relations: [
        'appointment',
        'doctor',
        'prescriptions',
        'prescriptions.items',
      ],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const apptIds = consultations
      .map((c) => c.appointmentId)
      .filter(Boolean) as string[];
    if (!apptIds.length) return consultations;

    const labOrders = await this.db.repo(LabOrder).find({
      where: { tenantId, appointmentId: In(apptIds) },
      relations: ['items', 'items.labTest'],
      order: { createdAt: 'DESC' },
    });

    const ordersMap = new Map<string, typeof labOrders>();
    for (const order of labOrders) {
      if (!order.appointmentId) continue;
      if (!ordersMap.has(order.appointmentId))
        ordersMap.set(order.appointmentId, []);
      ordersMap.get(order.appointmentId)!.push(order);
    }

    return consultations.map((c) => ({
      ...c,
      labOrders: ordersMap.get(c.appointmentId!) ?? [],
    }));
  }
}
