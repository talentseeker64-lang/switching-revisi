import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RoutingService } from './routing.service.js';
import { CreateRoutingRuleDto } from './dto/create-routing-rule.dto.js';
import { UpdateRoutingRuleDto } from './dto/update-routing-rule.dto.js';
import { ListRoutingRulesQueryDto } from './dto/list-routing-rules-query.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('routing')
@ApiBearerAuth('jwt')
@Controller('api/v1/routing-rules')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'List routing rules' })
  findAll(@Query() query: ListRoutingRulesQueryDto) {
    return this.routingService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get routing rule detail' })
  findOne(@Param('id') id: string) {
    return this.routingService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Create a routing rule' })
  create(@Body() dto: CreateRoutingRuleDto) {
    return this.routingService.create(dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Update a routing rule' })
  update(@Param('id') id: string, @Body() dto: UpdateRoutingRuleDto) {
    return this.routingService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a routing rule' })
  async remove(@Param('id') id: string) {
    await this.routingService.remove(id);
    return { id, deleted: true };
  }
}
