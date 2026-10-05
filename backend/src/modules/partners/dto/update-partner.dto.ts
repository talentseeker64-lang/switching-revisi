import { ApiProperty } from '@nestjs/swagger';
import { PartnerType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePartnerDto {
  @ApiProperty({ example: 'Koperasi Sejahtera Bersama', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiProperty({ enum: PartnerType, required: false })
  @IsOptional()
  @IsEnum(PartnerType)
  type?: PartnerType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactPhone?: string;
}
