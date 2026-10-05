import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ description: "The partner's own reference id for this transaction" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  businessTransactionId!: string;

  @ApiProperty({ example: 'PAYMENT_SETTLEMENT' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  transactionType!: string;

  @ApiProperty({ description: 'Arbitrary transaction payload', type: Object })
  @IsObject()
  payload!: Record<string, unknown>;
}
