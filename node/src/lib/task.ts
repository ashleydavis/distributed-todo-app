import { IRecord } from "sync";

export interface ITask extends IRecord {
    id: string;
    text: string;
    completed: boolean;
}
