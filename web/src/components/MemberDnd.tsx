import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import type { MemberKey } from '../api';

/** What a dragged row carries: who it is and which side of the line it is on. */
interface Dragged {
  member: MemberKey;
  playing: boolean;
  label: string;
}

/**
 * Drag a row across the line to put someone in or out. This is the only file
 * that knows the drag library: everything else sees `onMove(member, playing)`.
 */
export function MemberDnd({
  onMove,
  children,
}: {
  onMove: (member: MemberKey, playing: boolean) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short press first, so scrolling the table with a thumb is not a drag.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    useSensor(KeyboardSensor)
  );
  const [dragged, setDragged] = useState<Dragged | null>(null);

  const finish = (event: DragEndEvent) => {
    const from = event.active.data.current as Dragged | undefined;
    const to = event.over?.data.current as { playing: boolean } | undefined;
    setDragged(null);
    if (from && to && from.playing !== to.playing)
      onMove(from.member, to.playing);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragged(e.active.data.current as Dragged)
      }
      onDragEnd={finish}
      onDragCancel={() => setDragged(null)}
    >
      {children}
      <DragOverlay>
        {dragged && <div className="drag-ghost">{dragged.label}</div>}
      </DragOverlay>
    </DndContext>
  );
}

/** The grip cell of a row: the part that is dragged. */
export function DragHandle({
  id,
  member,
  playing,
  label,
}: {
  id: string;
  member: MemberKey;
  playing: boolean;
  label: string;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id,
    data: { member, playing, label } satisfies Dragged,
  });
  return (
    <td
      ref={setNodeRef}
      className="grip"
      aria-label={`Arrastrar a ${label}`}
      data-testid="drag-handle"
      {...attributes}
      {...listeners}
    >
      ⠿
    </td>
  );
}

/** One side of the line: dropping a row here puts it in (or out of) the convocatoria. */
export function DropZone({
  playing,
  children,
}: {
  playing: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: playing ? 'zone-in' : 'zone-out',
    data: { playing },
  });
  return (
    <tbody
      ref={setNodeRef}
      className={isOver ? 'drop-over' : undefined}
      data-testid={playing ? 'zone-in' : 'zone-out'}
    >
      {children}
    </tbody>
  );
}
