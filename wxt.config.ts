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
        permissions: ['storage', 'contextMenus'],
        browser_specific_settings: {
            gecko: {
                strict_min_version: '140.0',
                data_collection_permissions: {
                    required: ['none'],
                },
            },
        },
    },
    manifestGeneration: {
        chrome: {
            permissions: ['storage', 'contextMenus', 'offscreen'],
            browser_specific_settings: undefined,
        },
    },

});