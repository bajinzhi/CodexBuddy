import { useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { QueuedMessage } from "../../../types";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../../app/hooks/useMenuController";

type ComposerQueueProps = {
  queuedMessages: QueuedMessage[];
  pausedReason?: string | null;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
};

export function ComposerQueue({
  queuedMessages,
  pausedReason = null,
  onEditQueued,
  onDeleteQueued,
}: ComposerQueueProps) {
  const { t } = useTranslation(["app", "common"]);

  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <div className="composer-queue">
      <div className="composer-queue-title">{t("composer.queue.title")}</div>
      {pausedReason ? (
        <div className="composer-queue-hint">{pausedReason}</div>
      ) : null}
      <div className="composer-queue-list">
        {queuedMessages.map((item) => (
          <div key={item.id} className="composer-queue-item">
            {(() => {
              const imageCountLabel = item.images?.length
                ? t("composer.queue.imageCount", { count: item.images.length })
                : "";
              const hasText = Boolean(item.text?.trim());
              return (
                <span className="composer-queue-text">
                  {hasText ? item.text : imageCountLabel}
                  {hasText && imageCountLabel ? ` · ${imageCountLabel}` : ""}
                </span>
              );
            })()}
            <QueueMenuButton
              item={item}
              onEditQueued={onEditQueued}
              onDeleteQueued={onDeleteQueued}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type QueueMenuButtonProps = {
  item: QueuedMessage;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
};

function QueueMenuButton({ item, onEditQueued, onDeleteQueued }: QueueMenuButtonProps) {
  const menu = useMenuController();
  const { t } = useTranslation(["app", "common"]);
  const handleToggleMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      menu.toggle();
    },
    [menu],
  );

  const handleEdit = useCallback(() => {
    menu.close();
    onEditQueued?.(item);
  }, [item, menu, onEditQueued]);

  const handleDelete = useCallback(() => {
    menu.close();
    onDeleteQueued?.(item.id);
  }, [item.id, menu, onDeleteQueued]);

  return (
    <div className="composer-queue-menu-wrap" ref={menu.containerRef}>
      <button
      type="button"
      className={`composer-queue-menu${menu.isOpen ? " is-open" : ""}`}
      onClick={handleToggleMenu}
      aria-label={t("composer.queue.itemMenuAria")}
      aria-haspopup="menu"
      aria-expanded={menu.isOpen}
    >
      ...
    </button>
      {menu.isOpen && (
        <PopoverSurface className="composer-queue-item-popover" role="menu">
          <PopoverMenuItem onClick={handleEdit}>{t("common:actions.edit")}</PopoverMenuItem>
          <PopoverMenuItem onClick={handleDelete}>{t("common:actions.delete")}</PopoverMenuItem>
        </PopoverSurface>
      )}
    </div>
  );
}
