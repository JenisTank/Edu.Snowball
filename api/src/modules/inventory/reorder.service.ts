import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service';
import { alertSignal, itemsNeedingAlert } from './reorder.rules';

/**
 * Keeps `reorder_alerts` in step with stock.
 *
 * Called from every path that changes a quantity (movement, issue to student,
 * opening stock, goods receipt) and from the daily tick, which catches anything
 * a manual `psql` statement might have moved behind our back.
 */
@Injectable()
export class ReorderService {
  private readonly log = new Logger('Reorder');

  constructor(private prisma: PrismaService) {}

  /**
   * Re-evaluate one item. Cheap enough to call inline: one select, and a write
   * only when the state actually changed.
   */
  async evaluate(itemId: string): Promise<'RAISED' | 'CLEARED' | 'UNCHANGED'> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item || !item.active) return 'UNCHANGED';

    const open = await this.prisma.reorderAlert.findFirst({
      where: { itemId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      orderBy: { raisedAt: 'desc' },
    });
    const signal = alertSignal(item, !!open);

    if (signal === 'RAISED') {
      await this.prisma.reorderAlert.create({
        data: {
          itemId,
          unitId: item.unitId,
          quantity: item.quantity,
          reorderLevel: item.reorderLevel,
          status: 'OPEN',
        },
      });
      this.log.log(`Reorder alert: ${item.sku} at ${item.quantity}/${item.reorderLevel}`);
      return 'RAISED';
    }

    if (signal === 'CLEARED' && open) {
      await this.prisma.reorderAlert.update({
        where: { id: open.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      this.log.log(`Reorder alert cleared: ${item.sku} at ${item.quantity}/${item.reorderLevel}`);
      return 'CLEARED';
    }

    // Quantity moved but the alert still stands: keep the row truthful.
    if (open && open.quantity !== item.quantity) {
      await this.prisma.reorderAlert.update({
        where: { id: open.id },
        data: { quantity: item.quantity, reorderLevel: item.reorderLevel },
      });
    }
    return 'UNCHANGED';
  }

  /** Daily sweep: raise what is missing, refresh what is stale. */
  async sweep() {
    const items = await this.prisma.inventoryItem.findMany({
      where: { active: true, reorderLevel: { gt: 0 } },
      select: { id: true, sku: true, name: true, quantity: true, reorderLevel: true },
    });
    const open = await this.prisma.reorderAlert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      select: { itemId: true },
    });
    const openSet = new Set(open.map((a) => a.itemId));

    const missing = itemsNeedingAlert(items.filter((i) => !openSet.has(i.id)));
    for (const item of missing) await this.evaluate(item.id);

    // Alerts whose stock has recovered since the last sweep.
    const byId = new Map(items.map((i) => [i.id, i]));
    let cleared = 0;
    for (const itemId of openSet) {
      const item = byId.get(itemId);
      if (!item) continue;
      if ((await this.evaluate(itemId)) === 'CLEARED') cleared += 1;
    }

    return { scanned: items.length, raised: missing.length, cleared };
  }
}
