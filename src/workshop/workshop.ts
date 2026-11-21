// The workshop owns the editable blueprint and its undo history.
import type { RouteDef } from '../data/routeTypes';
import { stock, type Blueprint, type Kit } from './blueprint';
import type { PartKind } from '../data/parts';

export interface WorkshopSnapshot {
  bp: Blueprint;
  undo: Blueprint[];
  redo: Blueprint[];
}

export class Workshop {
  bp: Blueprint;
  private undoStack: Blueprint[] = [];
  private redoStack: Blueprint[] = [];
  readonly kit: Kit;

  constructor(route: RouteDef, bp?: Blueprint) {
    this.kit = route.kit;
    this.bp = bp ?? route.starter;
  }

  stock(): Record<PartKind, number> {
    return stock(this.kit, this.bp);
  }

  /** Commit an already-validated edit as one undoable step. */
  commit(next: Blueprint): void {
    this.undoStack.push(this.bp);
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = [];
    this.bp = next;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.bp);
    this.bp = prev;
    return true;
  }
  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.bp);
    this.bp = next;
    return true;
  }

  snapshot(): WorkshopSnapshot {
    return { bp: this.bp, undo: [...this.undoStack], redo: [...this.redoStack] };
  }
  restore(s: WorkshopSnapshot): void {
    this.bp = s.bp;
    this.undoStack = [...s.undo];
    this.redoStack = [...s.redo];
  }
}
