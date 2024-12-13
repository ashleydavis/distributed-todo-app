import React, { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useCollection, useQuery } from './lib/db-context';
import { ITask } from './defs/task';
import { IProject } from './defs/project';

interface ITaskProps {
    task: ITask;
    editingId: string | null;
    setEditingId: (id: string | null) => void;
}

export function Task({ task, editingId, setEditingId }: ITaskProps) {

    const [text, setText] = useState(task.description);

    const { collection: tasksCollection } = useCollection<ITask>("tasks");
    const { collection: projectsCollection } = useCollection<IProject>("projects");
    const { documents: projects } = useQuery<IProject>("projects");

    async function updateTask(update: Omit<Partial<ITask>, "_id">) {
        await tasksCollection.upsertOne(task._id, update);
        setEditingId(null);
    }

    async function onToggleCompleted() {
        await tasksCollection.upsertOne(task._id, { completed: !task.completed });
    }

    function onTextChange(e: React.ChangeEvent<HTMLInputElement>) {
        setText(e.target.value);
    }

    async function onSubmitText(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            await updateTask({ description: text });
        }
        else if (e.key === 'Escape') {
            setEditingId(null);
            setText(task.description);
        }
    }

    return (
        <li className={`task ${task.completed ? 'completed' : ''}`}>
            <input
                type="checkbox"
                checked={task.completed}
                onChange={onToggleCompleted}
            />
            {editingId === task._id ? (
                <input
                    className="edit-input"
                    type="text"
                    value={text}
                    onChange={onTextChange}
                    onKeyDown={onSubmitText}
                    autoFocus
                    />
            ) : (
                <span
                    onClick={() => setEditingId(task._id)}
                    className="task-text"
                    >
                    {task.description}
                </span>
            )}

            <select
                value={task.projectId === undefined ? "no-project" : task.projectId}
                onChange={async (e) => {
                    if (e.target.value === "new-project") {
                        const projectName = window.prompt("Enter the name of the new project:");
                        if (projectName) {
                            const projectId = uuid();
                            await Promise.all([
                                projectsCollection.upsertOne(projectId, { name: projectName }),
                                updateTask({ projectId })
                            ]);
                        }
                    }
                    else {
                        await updateTask({ projectId: e.target.value });
                    }
                }}
                style={{ marginRight: "20px" }}
                >
                <option value="no-project">None</option>
                {projects.map(project => {
                    return (
                        <option key={project._id} value={project._id}>
                            {project.name}
                        </option>
                    );
                })}
                <option
                    value="new-project"
                    >
                    New project...
                </option>
            </select>

            <button
                className="delete-button"
                onClick={() => tasksCollection.deleteOne(task._id)}
                >
                Delete
            </button>
        </li>
    );
};