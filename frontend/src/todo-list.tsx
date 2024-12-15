import React, { useState } from 'react';
import { Task } from './task';
import { useQuery } from './lib/db-context';
import { ITask } from './defs/task';
import { IProject } from './defs/project';

//
// Sort tasks by time.
//
function sortTasks(tasks: ITask[]) {
    const sortedTask = [...tasks];
    return sortedTask.sort((a, b) => a.timestamp - b.timestamp);
}

export function TodoList() {

    const [ editingId, setEditingId ] = useState<string | null>(null);
    const { documents: projects } = useQuery<IProject>("projects");
    const [ selectedProjectId, setSelectedProjectId ] = useState<string | undefined>(undefined);
    const { documents: tasks } = useQuery<ITask>("tasks", {
        transform: sortTasks,
        match: selectedProjectId !== undefined 
            ? {
                name: "projectId",
                value: selectedProjectId,
            }
            : undefined,
    });

    return (
        <>
            <select
                value={selectedProjectId || "all-projects"}
                onChange={async (e) => {
                    if (e.target.value === "all-projects") {
                        setSelectedProjectId(undefined);
                    }
                    else {
                        setSelectedProjectId(e.target.value);
                    }
                }}
                style={{ marginRight: "20px" }}
                >
                <option value="all-projects">All</option>
                {projects.map(project => {
                    return (
                        <option key={project._id} value={project._id}>
                            {project.name}
                        </option>
                    );
                })}
            </select>

            <ul className="todo-list">
                {tasks.map(task => (
                    <Task
                    key={task._id}
                    task={task}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    />
                ))}
            </ul>
        </>
    );
};
