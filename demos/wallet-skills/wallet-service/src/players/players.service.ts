import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerListDto, PlayerResponseDto, WalletResponseDto } from './dto/player.dto';

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string): Promise<PlayerResponseDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.create({ data: { name } });
      const wallet = await tx.wallet.create({ data: { playerId: player.id, balance: 0n, version: 0 } });
      return { player, wallet };
    });

    return {
      id: created.player.id,
      name: created.player.name,
      createdAt: created.player.createdAt.toISOString(),
      wallet: {
        id: created.wallet.id,
        balance: money(created.wallet.balance),
        version: created.wallet.version,
      },
    };
  }

  async wallet(playerId: string): Promise<WalletResponseDto> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { wallet: true },
    });
    if (!player) {
      throw new NotFoundException('player not found');
    }
    if (!player.wallet) {
      throw new NotFoundException('wallet not found');
    }
    return {
      id: player.wallet.id,
      playerId: player.id,
      balance: money(player.wallet.balance),
      version: player.wallet.version,
    };
  }

  async list(page: number, limit: number): Promise<PlayerListDto> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }

    // Page numbers are easier for the admin UI than opaque cursors.
    const players = await this.prisma.player.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    const items: PlayerListDto['items'] = [];
    for (const player of players) {
      const wallet = await this.prisma.wallet.findUnique({ where: { playerId: player.id } });
      if (!wallet) continue;
      items.push({
        id: player.id,
        name: player.name,
        createdAt: player.createdAt.toISOString(),
        walletId: wallet.id,
        balance: money(wallet.balance),
      });
    }

    return { items, page, limit };
  }
}
