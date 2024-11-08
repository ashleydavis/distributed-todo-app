import React, { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { ITask, useDatabase } from './lib/db-context';

interface ITaskProps {
    task: ITask;
    editingId: string | null;
    setEditingId: (id: string | null) => void;
}

export function Task({ task, editingId, setEditingId }: ITaskProps) {
    
    const [text, setText] = useState(task.description);

    const { projects, upsertProject, deleteTask, upsertTask } = useDatabase();

    async function updateTask(update: Omit<Partial<ITask>, "_id">) {
        upsertTask(task.id, update);
        setEditingId(null);
    }

    async function onToggleCompleted() {
        await upsertTask(task.id, { completed: !task.completed });
    }

    function onTextChange(e: React.ChangeEvent<HTMLInputElement>) {
        setText(e.target.value);
    }

    function onSubmitText(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            updateTask({ description: text });
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
            {editingId === task.id ? (
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
                    onClick={() => setEditingId(task.id)}
                    className="task-text"
                    >
                    {task.description}
                </span>
            )}

            <select
                value={task.projectId === undefined ? "no-project" : task.projectId}
                onChange={(e) => {
                    if (e.target.value === "new-project") {
                        const projectName = window.prompt("Enter the name of the new project:");
                        if (projectName) {
                            const projectId = uuid();
                            upsertProject({ id: projectId, name: projectName });
                            updateTask({ projectId });
                        }
                    }
                    else {
                        updateTask({ projectId: e.target.value });
                    }
                }}
                style={{ marginRight: "20px" }}
                >
                <option value="no-project">None</option>
                {projects.map(project => {
                    return (
                        <option key={project.id} value={project.id}>
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
                onClick={() => deleteTask(task.id)}
                >
                Delete
            </button>
        </li>
    );
};