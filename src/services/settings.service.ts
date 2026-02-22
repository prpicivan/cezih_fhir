import db from '../db';
import { config } from '../config';

class SettingsService {
    getSettings() {
        // Fetch all settings
        const rows = db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[];
        const settings: any = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        // Add some system status info
        settings.serverTime = new Date().toISOString();
        settings.cezihUrl = config.cezih.baseUrl;
        settings.environment = config.nodeEnv;

        return settings;
    }

    updateSetting(key: string, value: string) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
        return { success: true };
    }

    async forceSync() {
        // Mock sync logic
        await new Promise(resolve => setTimeout(resolve, 1500));

        const now = new Date().toISOString();
        this.updateSetting('terminology_last_sync', now);
        this.updateSetting('code_systems_count', '142');
        this.updateSetting('value_sets_count', '56');

        return { success: true, timestamp: now };
    }

    getMenuConfig() {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('menu_config') as { value: string };
        if (row && row.value) {
            const parsed = JSON.parse(row.value);
            // Handle both flat array and { config: [...] } wrapper
            return Array.isArray(parsed) ? parsed : (parsed.config || []);
        }
        return [];
    }

    updateMenuConfig(newConfig: any[]) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('menu_config', JSON.stringify(newConfig));
        return { success: true };
    }
}

export const settingsService = new SettingsService();
