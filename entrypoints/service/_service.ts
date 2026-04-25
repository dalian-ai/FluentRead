import {services} from "../utils/option";
import custom from "./custom";
import deepseek from "./deepseek";

type ServiceFunction = (message: any) => Promise<any>;
type ServiceMap = {[key: string]: ServiceFunction;};

export const _service: ServiceMap = {
    [services.custom]: custom,
    [services.deepseek]: deepseek,
}
