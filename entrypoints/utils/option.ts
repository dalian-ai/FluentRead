export const services = {
    // 大模型翻译
    custom: "custom",
    zhipu: "zhipu",
    deepseek: "deepseek",
    siliconCloud: "siliconCloud",
    openrouter: "openrouter",
};

export const servicesType = {
    // 阵营划分
    machine: new Set<string>([]),
    AI: new Set([
        services.custom,
        services.zhipu,
        services.deepseek,
        services.siliconCloud,
        services.openrouter,
    ]),
    // 需要 token
    useToken: new Set([
        services.custom,
        services.zhipu,
        services.deepseek,
        services.siliconCloud,
        services.openrouter,
    ]),
    // 需要 model
    useModel: new Set([
        services.custom,
        services.zhipu,
        services.deepseek,
        services.siliconCloud,
        services.openrouter,
    ]),
    // 支持代理
    useProxy: new Set([
        services.custom,
        services.zhipu,
        services.deepseek,
        services.siliconCloud,
        services.openrouter,
    ]),
    // 支持自定义 URL 的服务
    useCustomUrl: new Set([
        services.custom,
    ]),

    isMachine: (service: string) => servicesType.machine.has(service),
    isAI: (service: string) => servicesType.AI.has(service),
    isUseToken: (service: string) => servicesType.useToken.has(service),
    isUseProxy: (service: string) => servicesType.useProxy.has(service),
    isUseModel: (service: string) => servicesType.useModel.has(service),
    isCustom: (service: string) => service === services.custom,
    isNewApi: (service: string) => false,
    isUseAkSk: (service: string) => false,
    isCoze: (service: string) => false,
    isYoudao: (service: string) => false,
    isTencent: (service: string) => false,
    isAzureOpenai: (service: string) => false,
    isUseCustomUrl: (service: string) => servicesType.useCustomUrl.has(service),
};

export const customModelString = "自定义模型";
export const models = new Map<string, Array<string>>([
    [services.custom, ["gpt-5-nano", "gpt-5-mini", customModelString]],
    [services.zhipu, ["glm-4.5", "GLM-4-Flash", "glm-4-plus", "glm-4", customModelString]],
    [services.deepseek, ["deepseek-chat", "deepseek-reasoner", customModelString]],
    [services.siliconCloud, ["Qwen/Qwen3-Coder-30B-A3B-Instruct", "Qwen/Qwen3-8B", "THUDM/GLM-Z1-9B-0414", "THUDM/GLM-4-9B-0414",
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
         customModelString]],
    [services.openrouter, ["google/gemini-2.0-flash-exp", "qwen/qwen-2-7b-instruct", "huggingfaceh4/zephyr-7b-beta", customModelString]]
]);

export const options = {
    on: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    // 是否即时翻译
    autoTranslate: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    // 是否使用缓存
    useCache: [
        {value: true, label: "开启"},
        {value: false, label: "关闭"},
    ],
    // 是否使用批量翻译
    useBatchTranslate: [
        {value: true, label: "开启（推荐，更快更省）"},
        {value: false, label: "关闭"},
    ],
    form: [{value: "auto", label: "自动检测"}],
    to: [
        {value: "zh-Hans", label: "中文"},
        {value: "en", label: "英语"},
        {value: "ja", label: "日语"},
    ],
    keys: [
        {value: "none", label: "禁用快捷键"},

        {value: "Computer", label: "键盘选项", disabled: true},
        {value: "Control", label: "Ctrl"},
        {value: "Alt", label: "Alt"},
        {value: "Shift", label: "Shift"},
        {value: "Escape", label: "ESC"},
        {value: "`", label: "波浪号键"},

        {value: "mouse", label: "鼠标选项", disabled: true},
        {value: "DoubleClick", label: "鼠标双击"},
        {value: "LongPress", label: "鼠标长按"},
        {value: "MiddleClick", label: "鼠标滚轮单击"},

        {value: "touchscreen", label: "触屏设备选项", disabled: true},
        {value: "TwoFinger", label: "双指翻译"},
        {value: "ThreeFinger", label: "三指翻译"},
        {value: "FourFinger", label: "四指翻译"},
        {value: "DoubleClickScree", label: "双击翻译"},
        {value: "TripleClickScree", label: "三击翻译"},
        
        {value: "custom", label: "自定义快捷键（测试版）"},
    ],
    services: [
        // AI翻译
        {value: "ai", label: "AI翻译", disabled: true},
        {value: services.custom, label: "自定义接口⭐️"},
        {value: services.zhipu, label: "智谱清言"},
        {value: services.deepseek, label: "DeepSeek️"},
        {value: services.siliconCloud, label: "硅基流动⭐️"},
        {value: services.openrouter, label: "OpenRouter"},
    ],
    display: [
        {value: 0, label: "仅译文模式"},
        {value: 1, label: "双语对照模式"},
    ],
    // 双语翻译样式
    styles: [
        // 基础样式
        {value: "basic", label: "基础样式", disabled: true},
        {value: 0, label: "朴素模式", class: "fluent-display-default", group: "basic"},
        {value: 1, label: "加粗显示", class: "fluent-display-bold", group: "basic"},
        {value: 2, label: "优雅斜体", class: "fluent-display-italic", group: "basic"},
        {value: 3, label: "立体阴影", class: "fluent-display-text-shadow", group: "basic"},

        // 下划线系列
        {value: "underline", label: "下划线系列", disabled: true},
        {value: 4, label: "蓝色实线", class: "fluent-display-solid-underline", group: "underline"},
        {value: 5, label: "优雅虚线", class: "fluent-display-dot-underline", group: "underline"},
        {value: 6, label: "活泼波浪", class: "fluent-display-wavy", group: "underline"},

        // 卡片系列
        {value: "card", label: "卡片系列", disabled: true},
        {value: 7, label: "简约卡片", class: "fluent-display-card-mode", group: "card"},
        {value: 8, label: "渐变卡片", class: "fluent-display-modern-card", group: "card"},
        {value: 9, label: "纸张卡片", class: "fluent-display-paper", group: "card"},

        // 高亮系列
        {value: "highlight", label: "高亮系列", disabled: true},
        {value: 10, label: "学习标记", class: "fluent-display-learning-mode", group: "highlight"},
        {value: 11, label: "荧光标记", class: "fluent-display-marker", group: "highlight"},
        {value: 12, label: "柔和渐变", class: "fluent-display-highlight-fade", group: "highlight"},

        // 背景色系列
        {value: "background", label: "背景色系列", disabled: true},
        {value: 13, label: "温暖黄底", class: "fluent-display-lightyellow", group: "background"},
        {value: 14, label: "清新蓝底", class: "fluent-display-lightblue", group: "background"},
        {value: 15, label: "素雅灰底", class: "fluent-display-lightgray", group: "background"},

        // 特殊效果
        {value: "special", label: "特殊效果", disabled: true},
        {value: 16, label: "典雅引用", class: "fluent-display-quote", group: "special"},
        {value: 17, label: "轻巧边框", class: "fluent-display-border", group: "special"},
        {value: 18, label: "阅读焦点", class: "fluent-display-focus", group: "special"},
        {value: 19, label: "简约底线", class: "fluent-display-clean", group: "special"},

        // 专业样式
        {value: "pro", label: "专业样式", disabled: true},
        {value: 20, label: "代码风格", class: "fluent-display-tech", group: "pro"},
        {value: 21, label: "书籍风格", class: "fluent-display-elegant", group: "pro"},

        // 透明度
        {value: "transparent", label: "透明效果", disabled: true},
        {value: 22, label: "半透明弱化", class: "fluent-display-dimmed", group: "transparent"},
        {value: 23, label: "轻透明感", class: "fluent-display-transparent-mode", group: "transparent"},
    ],
    // 悬浮球快捷键选项
    floatingBallHotkeys: [
        {value: "none", label: "禁用快捷键"},
        {value: "Alt+T", label: "Alt+T / Option+T (默认)"},
        {value: "Alt+A", label: "Alt+A / Option+A"},
        {value: "Alt+S", label: "Alt+S / Option+S"},
        {value: "Alt+D", label: "Alt+D / Option+D"},
        {value: "Alt+Q", label: "Alt+Q / Option+Q"},
        {value: "Ctrl+Shift+T", label: "Ctrl+Shift+T / Control+Shift+T"},
        {value: "Ctrl+Shift+A", label: "Ctrl+Shift+A / Control+Shift+A"},
        {value: "F9", label: "F9"},
        {value: "F10", label: "F10"},
        {value: "F11", label: "F11"},
        {value: "F12", label: "F12"},
        {value: "custom", label: "自定义快捷键（测试版）"},
    ],
    theme: [
        {value: "auto", label: "跟随操作系统"},
        {value: "light", label: "亮色主题"},
        {value: "dark", label: "暗色主题"},
    ],
    // 输入框翻译目标语言选项
    inputBoxTranslationTarget: [
        {value: "zh-Hans", label: "中文"},
        {value: "en", label: "英语"},
        {value: "ja", label: "日语"},
    ],
    // 输入框翻译触发方式选项
    inputBoxTranslationTrigger: [
        {value: "disabled", label: "关闭"},
        {value: "triple_space", label: "连按三下空格"},
        {value: "triple_equal", label: "连按三下等号(=)"},
        {value: "triple_dash", label: "连按三下短横线(-)"},
    ],
};

export const defaultOption = {
    on: true,
    from: "auto",
    to: "zh-Hans",
    style: 1,
    display: 1,
    hotkey: "Control",
    service: services.custom,
    custom: "https://text-to-image-cf.dal.workers.dev/v1/chat/completions",
    system_role:
        "You are a professional, authentic machine translation engine.",
    user_role: `Translate the following text into {{to}}, If translation is unnecessary (e.g. proper nouns, codes, etc.), return the original text. NO explanations. NO notes:

{{origin}}`,
    count: 0,
    useCache: true,
    useBatchTranslate: true, // 默认开启批量翻译
    floatingBallHotkey: "Alt+T", // 默认悬浮球快捷键
    inputBoxTranslationTrigger: "disabled", // 默认关闭输入框翻译
    inputBoxTranslationTarget: "en", // 默认翻译成英文
};

