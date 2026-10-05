import { ApiProperty } from '@nestjs/swagger';
import { PartnerType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePartnerDto {
  @ApiProperty({ example: 'KOP-SEJAHTERA' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must be uppercase letters, numbers, dashes or underscores only',
  })
  code!: string;

  @ApiProperty({ example: 'Koperasi Sejahtera Bersama' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: PartnerType })
  @IsEnum(PartnerType)
  type!: PartnerType;

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
