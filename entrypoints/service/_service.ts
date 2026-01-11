import {services} from "../utils/option";
import custom from "./custom";
import zhipu from "./zhipu";
import deepseek from "./deepseek";
import common from "@/entrypoints/service/common";

type ServiceFunction = (message: any) => Promise<any>;
type ServiceMap = {[key: string]: ServiceFunction;};

export const _service: ServiceMap = {
    // AI翻译
    [services.custom]: custom,
    [services.zhipu]: zhipu,
    [services.deepseek]: deepseek,
    [services.siliconCloud]: common,
    [services.openrouter]: common,
}
