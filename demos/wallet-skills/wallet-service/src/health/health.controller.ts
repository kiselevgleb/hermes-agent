import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

class HealthDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';
}

class VersionDto {
  @ApiProperty({ example: 'dev' })
  commit!: string;
}

@ApiTags('meta')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness. Fails when the database cannot be reached.' })
  @ApiOkResponse({ type: HealthDto })
  async health(): Promise<HealthDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }
    return { status: 'ok' };
  }

  @Get('version')
  @ApiOperation({ summary: 'Git commit baked into this process.' })
  @ApiOkResponse({ type: VersionDto })
  version(): VersionDto {
    return { commit: process.env.GIT_COMMIT ?? 'dev' };
  }
}
