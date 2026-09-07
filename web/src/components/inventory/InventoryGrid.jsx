import React, { useState } from 'react';
import { InventoryItem } from './InventoryItem';
import { ItemDetailsModal } from './ItemDetailsModal';
import { Package, Search } from 'lucide-react';

export function InventoryGrid({ items = [], viewMode = 'grid', isFiltered = false }) {
  const [selectedItem, setSelectedItem] = useState(null);

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          {isFiltered ? <Search size={44} color="#64748b" /> : <Package size={44} color="#64748b" />}
        </div>
        <h3 className="empty-state-title">
          {isFiltered ? 'По запросу ничего не найдено' : 'Инвентарь персонажа пуст'}
        </h3>
        <p className="empty-state-desc">
          {isFiltered 
            ? 'Попробуйте изменить параметры поиска или сбросить фильтры по категориям.' 
            : 'Получайте предметы за участие в ивентах, сюжетных арках или покупку в магазине /shop в Discord.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={viewMode === 'list' ? 'inventory-list' : 'inventory-grid'}>
        {items.map((item, idx) => (
          <InventoryItem 
            key={item.id || idx}
            item={item}
            viewMode={viewMode}
            onSelect={setSelectedItem}
          />
        ))}
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <ItemDetailsModal 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
        />
      )}
    </>
  );
}
