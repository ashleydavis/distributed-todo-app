import React, { useState } from 'react';
import { useDatabase } from './lib/db-context';
import { v4 as uuid } from 'uuid';

export function TaskInput() {
    
    const [ text, setText] = useState('');
    const { upsertTask } = useDatabase();
    
    async function addNewTask(description: string) {
        const newTask = {
            timestamp: Date.now(),
            description,
            completed: false,
        };
        await upsertTask(uuid(), newTask);
    }

    function onTextChange(e: React.ChangeEvent<HTMLInputElement>) {
        setText(e.target.value);
    }

    function onSubmitText(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && text.trim() !== '') {
            addNewTask(text);
            setText('');
        }
    }

    function onAddClick() {
        if (text.trim() !== '') {
            addNewTask(text);
            setText('');
        }
    }

    return (
        <div className="task-input">
            <input
                type="text"
                value={text}
                onChange={onTextChange}
                onKeyDown={onSubmitText}
                placeholder="Add a new task..."
                />
            <button 
                onClick={onAddClick}
                >
                Add Task
            </button>
        </div>
    );
};

export default TaskInput;
