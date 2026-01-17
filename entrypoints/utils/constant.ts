import { services } from "./option";

// 常量工具类
export const urls: any = {
    [services.custom]: "https://text-to-image-cf.dal.workers.dev/v1",  
    [services.zhipu]: "https://open.bigmodel.cn/api/paas/v4",
    [services.deepseek]: "https://api.deepseek.com",
    [services.siliconCloud]: "https://api.siliconflow.cn/v1",
    [services.openrouter]: "https://openrouter.ai/api/v1",
}

export const method = {POST: "POST", GET: "GET",};

export const constants = {
    // 键鼠事件
    DoubleClick: "DoubleClick",
    LongPress: "LongPress",
    MiddleClick: "MiddleClick",
    // 触屏设备事件
    TwoFinger: "TwoFinger",
    ThreeFinger: "ThreeFinger",
    FourFinger: "FourFinger",
    DoubleClickScreen: "DoubleClickScree",
    TripleClickScreen: "TripleClickScreen",
}

export const styles = {
    // 仅译文模式
    singleTranslation: 0,
    // 双语对照模式
    bilingualTranslation: 1,
}

// 右键菜单ID常量
export const CONTEXT_MENU_IDS = {
    TRANSLATE_FULL_PAGE: 'fluent-read-translate-full-page',
    RESTORE_ORIGINAL: 'fluent-read-restore-original',
}
