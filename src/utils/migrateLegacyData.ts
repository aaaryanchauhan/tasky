const LEGACY_KEYS = {
  'taskflow-websites': 'tasky-websites',
  'taskflow-website-folders': 'tasky-website-folders',
  'taskflow-quicklinks-visible': 'tasky-quicklinks-visible',
  'taskflowNotes': 'tasky-notes',
  'taskflow-columns': 'tasky-columns'
};

export function migrateLegacyData() {
  let hasMigratedData = false;

  // Check if migration has already been performed
  if (localStorage.getItem('tasky-migration-completed')) {
    return;
  }

  // Migrate each legacy key
  Object.entries(LEGACY_KEYS).forEach(([oldKey, newKey]) => {
    const legacyData = localStorage.getItem(oldKey);
    
    if (legacyData) {
      // Only migrate if new key doesn't already have data
      if (!localStorage.getItem(newKey)) {
        try {
          localStorage.setItem(newKey, legacyData);
          hasMigratedData = true;
          console.log(`Migrated data from ${oldKey} to ${newKey}`);
        } catch (error) {
          console.error(`Error migrating ${oldKey}:`, error);
        }
      }
    }
  });

  if (hasMigratedData) {
    // Mark migration as completed
    localStorage.setItem('tasky-migration-completed', 'true');
    console.log('Data migration completed successfully');
  }
} 