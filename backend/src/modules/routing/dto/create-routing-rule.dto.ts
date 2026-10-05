import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRoutingRuleDto {
  @ApiProperty({ example: 'Default blockchain routing for payment settlement' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'PAYMENT_SETTLEMENT' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  transactionType!: string;

  @ApiProperty({
    required: false,
    description: 'Scope this rule to one partner. Omit to apply to any partner.',
  })
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiProperty({ example: 'BLOCKCHAIN_GATEWAY' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  targetService!: string;

  @ApiProperty({
    required: false,
    description: 'Arbitrary target configuration, e.g. endpoint override or field mapping.',
  })
  @IsOptional()
  @IsObject()
  targetConfig?: Record<string, unknown>;

  @ApiProperty({ required: false, default: 100, description: 'Lower runs first' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
