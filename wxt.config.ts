import {defineConfig} from 'wxt';
import vue from '@vitejs/plugin-vue';
import {resolve} from 'path';
import fs from 'fs';


const packageJson = JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));


// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/webextension-polyfill'],
    imports: {
        addons: {
            vueTemplate: true,
        },
    },
    vite: () => ({
        plugins: [vue()],
        define: {
            'process.env.VUE_APP_VERSION': JSON.stringify(packageJson.version),
        }
    }),
    manifest: {
        permissions: ['storage', 'contextMenus', 'offscreen'],
        browser_specific_settings: {
            gecko: {
                strict_min_version: '109.0',
            },
        },
    },
    manifestGeneration: {
        firefox: {
            browser_specific_settings: {
                gecko: {
                    id: '{your-addon-id@example.com}',
                    strict_min_version: '109.0',
                },
            },
            // Firefox 要求声明数据收集权限
            data_collection_permissions: {
                user_data_collection: false, // 如果不收集用户数据，设为 false
            },
        },
    },

});