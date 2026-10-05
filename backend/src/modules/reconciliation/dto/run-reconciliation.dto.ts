import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunReconciliationDto {
  @ApiPropertyOptional({ default: 24, description: 'Check transactions updated within this many hours' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  windowHours: number = 24;
}
