import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { SyncEngine, DatabaseUpdate, Database, ISubscription } from "sync";
import { IIndexeddbDatabaseConfiguration, openDatabase, deleteRecord as _deleteRecord } from "./indexeddb";
import { v4 as uuid } from "uuid";
import { IndexeddbStorage } from "./indexeddb-storage";

const API_BASE_URL = process.env.API_BASE_URL!;
if (!API_BASE_URL) {
    throw new Error(`API_BASE_URL environment variable is required.`);
}

//
// A database record.
//
export interface IRecord {
    //
    // The unique id of the record.
    //
    id: string;
}

//
// Defines a task.
//
export interface ITask extends IRecord {
    //
    // The timestamp when the task was created.
    //
    timestamp: number;

    //
    // The description of the task.
    //
    description: string;

    //
    // Whether the task is completed.
    //
    completed: boolean;

    //
    // The id of the project the task belongs to.
    //
    projectId?: string;
}

//
// Defines a project.
//
export interface IProject extends IRecord {
    //
    // The name of the project.
    //
    name: string;
}

//
// Client-side interface to the task database.
//
export interface IDatabase {
    //
    // The list of tasks in the database.
    //
    tasks: ITask[];

    //
    // The list of projects in the database.
    //
    projects: IProject[];

    //
    // Deletes a task.
    //
    deleteTask(id: string): void;

    //
    // Inserts or updates a task.
    //
    upsertTask(id: string, task: Partial<ITask>): void;

    //
    // Inserts or updates a project.
    //
    upsertProject(project: IProject): void;
}

//
// Configuration for the indexeddb.
//
const tasksDatabaseConfiguration: IIndexeddbDatabaseConfiguration = {
    collections: [
        {
            name: "tasks",
            idField: "id",
        },
        {
            name: "projects",
            idField: "id",
        },
    ],
    versionNumber: 1,
}

//
// Configuration for the indexeddb.
//
const blockGraphDatabaseConfiguration: IIndexeddbDatabaseConfiguration = {
    collections: [
        {
            name: "blocks",
            idField: "id",
        },
        {
            name: "block-graphs",
            idField: "id",
        }
    ],
    versionNumber: 1,
}


const DatabaseContext = createContext<IDatabase | undefined>(undefined);

export interface IProps {
    children: ReactNode | ReactNode[];
}

export function DatabaseContextProvider({ children }: IProps) {

    //
    // The indexed db database.
    //
    const indexeddbRefs = useRef<IDBDatabase[]>([]);

    //
    // Reference to the database.
    //
    const databaseRef = useRef<Database | undefined>(undefined);

    //
    // Reference to the synchronization engine.
    //
    const syncEngineRef = useRef<SyncEngine | undefined>(undefined);

    //
    // The list of tasks in the database.
    //
    const [tasks, setTasks] = useState<ITask[]>([]);

    //
    // The list of projects in the database.
    //
    const [projects, setProjects] = useState<IProject[]>([]);

    //
    // Deletes a task.
    //
    function deleteTask(id: string): void {
        if (!databaseRef.current) {
            throw new Error(`Database is not open.`);
        }

        databaseRef.current.collection("tasks").deleteOne(id);
    }

    //
    // Inserts or updates a task.
    //
    function upsertTask(id: string, task: Omit<Partial<ITask>, "id">): void {
        if (!databaseRef.current) {
            throw new Error(`Database is not open.`);
        }

        databaseRef.current.collection("tasks").upsertOne(id, task);
    }

    //
    // Inserts or updates a project.
    //
    function upsertProject(project: IProject): void {
        if (!databaseRef.current) {
            throw new Error(`Database is not open.`);
        }

        databaseRef.current.collection("projects").upsertOne(project.id, project);
    }

    //
    // Receives updates from other clients and applies them to the database.
    //
    function onIncomingUpdates(updates: DatabaseUpdate[]): void {
        if (!databaseRef.current) {
            throw new Error(`Database is not open.`);
        }

        databaseRef.current.applyIncomingUpdates(updates);
    }

    //
    // Routes outgoing updates from the database to the synchronization engine.
    //
    function onOutgoingUpdates(updates: DatabaseUpdate[]): void {
        if (!syncEngineRef.current) {
            throw new Error(`Synchronization engine is not created!`);
        }

        syncEngineRef.current.commitUpdates(updates);
    }

    useEffect(() => {

        let tasksSubscription: ISubscription;
        let projectsSubscription: ISubscription;

        let nodeId = uuid();

        Promise.all([
                openDatabase("tasks-db", tasksDatabaseConfiguration),
                openDatabase("block-graph", blockGraphDatabaseConfiguration)
            ])
            .then(([tasksDb, blockGraphDb]) => {
                const database = new Database(new IndexeddbStorage(tasksDb), onOutgoingUpdates);
                const tasks = database.collection<ITask>("tasks");
                const projects = database.collection<IProject>("projects");

                indexeddbRefs.current = [tasksDb, blockGraphDb];
                databaseRef.current = database;

                tasksSubscription = tasks.subscribe(tasks => {
                    const sortedTask = [...tasks];
                    sortedTask.sort((a, b) => a.timestamp - b.timestamp); //todo: Really this only needs to happen when loaded from the db.
                    setTasks(sortedTask);
                });

                projectsSubscription = projects.subscribe(projects => {
                    setProjects(projects);
                });

                syncEngineRef.current = new SyncEngine(nodeId, API_BASE_URL, onIncomingUpdates, new IndexeddbStorage(blockGraphDb), 1000);
                return syncEngineRef.current.startSync();
            })
            .catch(error => {
                console.error(`Failed to open database and start synchronization:`);
                console.error(error.stack || error.message || error);
            });

        return () => {

            //
            // Stop the synchronization engine.
            //
            if (syncEngineRef.current) {
                syncEngineRef.current.stopSync();
                syncEngineRef.current = undefined;
            }

            for (const indexeddb of indexeddbRefs.current) {
                indexeddb.close();
            }

            indexeddbRefs.current = [];
            databaseRef.current = undefined;

            if (tasksSubscription) {
                tasksSubscription.unsubscribe();
            }

            if (projectsSubscription) {
                projectsSubscription.unsubscribe();
            }
        };
    }, []);

    const value: IDatabase = {
        tasks,
        projects,
        deleteTask,
        upsertTask,
        upsertProject,
    };

    return (
        <DatabaseContext.Provider value={value} >
            {children}
        </DatabaseContext.Provider>
    );
}

//
// Use the daatabase context in a component.
//
export function useDatabase(): IDatabase {
    const context = useContext(DatabaseContext);
    if (!context) {
        throw new Error(`Database context is not set! Add DatabaseContextProvider to the component tree.`);
    }
    return context;
}

