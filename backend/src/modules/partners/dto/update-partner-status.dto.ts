import { ApiProperty } from '@nestjs/swagger';
import { PartnerStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePartnerStatusDto {
  @ApiProperty({ enum: PartnerStatus })
  @IsEnum(PartnerStatus)
  status!: PartnerStatus;
}
