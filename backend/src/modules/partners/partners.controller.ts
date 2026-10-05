import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PartnersService } from './partners.service.js';
import { CreatePartnerDto } from './dto/create-partner.dto.js';
import { UpdatePartnerDto } from './dto/update-partner.dto.js';
import { UpdatePartnerStatusDto } from './dto/update-partner-status.dto.js';
import { ListPartnersQueryDto } from './dto/list-partners-query.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('partners')
@ApiBearerAuth('jwt')
@Controller('api/v1/partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'List partners (search/filter/paginate)' })
  findAll(@Query() query: ListPartnersQueryDto) {
    return this.partnersService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get partner detail incl. credential summaries' })
  findOne(@Param('id') id: string) {
    return this.partnersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Register a new partner' })
  create(@Body() dto: CreatePartnerDto) {
    return this.partnersService.create(dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Update partner profile' })
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Activate/deactivate/suspend a partner' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdatePartnerStatusDto) {
    return this.partnersService.updateStatus(id, dto);
  }

  @Post(':id/credentials')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue a new API key/secret for a partner (secret shown once)' })
  issueCredential(@Param('id') id: string) {
    return this.partnersService.issueCredential(id);
  }

  @Patch(':id/credentials/:credentialId/revoke')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Revoke a partner API credential' })
  revokeCredential(@Param('id') id: string, @Param('credentialId') credentialId: string) {
    return this.partnersService.revokeCredential(id, credentialId);
  }
}
