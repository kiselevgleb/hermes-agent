import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreatePlayerDto,
  ListPlayersQuery,
  PlayerListDto,
  PlayerResponseDto,
  WalletResponseDto,
} from './dto/player.dto';
import { PlayersService } from './players.service';

@ApiTags('players')
@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a player and an empty wallet.' })
  @ApiCreatedResponse({ type: PlayerResponseDto })
  create(@Body() dto: CreatePlayerDto): Promise<PlayerResponseDto> {
    return this.players.create(dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'List players with balances, page by page.' })
  @ApiOkResponse({ type: PlayerListDto })
  list(@Query() query: ListPlayersQuery): Promise<PlayerListDto> {
    return this.players.list(query.page ?? 1, query.limit ?? 20);
  }

  @Get(':id/wallet')
  @ApiOperation({ summary: 'Current wallet balance for a player.' })
  @ApiOkResponse({ type: WalletResponseDto })
  wallet(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<WalletResponseDto> {
    return this.players.wallet(id);
  }
}
