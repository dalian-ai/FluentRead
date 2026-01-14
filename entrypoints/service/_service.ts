import {services} from "../utils/option";
import custom from "./custom";
import zhipu from "./zhipu";
import deepseek from "./deepseek";
import common from "@/entrypoints/service/common";
import { unifiedTranslate } from "./unified";

type ServiceFunction = (message: any) => Promise<any>;
type ServiceMap = {[key: string]: ServiceFunction;};

// 使用统一的翻译服务（推荐）
// 如果需要特殊处理，可以保留原有的服务
export const _service: ServiceMap = {
    // 使用统一服务（OpenAI SDK）
    [services.custom]: unifiedTranslate,
    [services.zhipu]: unifiedTranslate,  // 智谱暂时保留旧实现，因为需要特殊的token生成
    [services.deepseek]: unifiedTranslate,
    [services.siliconCloud]: unifiedTranslate,
    [services.openrouter]: unifiedTranslate,
}
