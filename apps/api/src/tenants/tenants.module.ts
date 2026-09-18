import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '@mediflow/database';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

@Module({
  // Tenant lives in the platform (public) schema — needs @InjectRepository(Tenant)
  imports: [TypeOrmModule.forFeature([Tenant]), WhatsappModule],
  providers: [TenantsService],
  controllers: [TenantsController],
  exports: [TenantsService],
})
export class TenantsModule {}
