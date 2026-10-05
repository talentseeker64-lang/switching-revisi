import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { GatewayStatus } from '../../gateway-client/gateway-client.interface.js';

const GATEWAY_STATUSES: GatewayStatus[] = ['submitted', 'pending', 'confirmed', 'failed', 'timeout'];

export class GatewayWebhookDto {
  @ApiProperty()
  @IsString()
  gatewayRequestId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiProperty({ enum: GATEWAY_STATUSES })
  @IsIn(GATEWAY_STATUSES)
  status!: GatewayStatus;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  blockchainTxHash?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  errorMessage?: string | null;
}
