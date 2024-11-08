import React, { useState } from 'react';
import { Task } from './task';
import { useDatabase } from './lib/db-context';

export function TodoList() {

    const { tasks } = useDatabase();
    const [ editingId, setEditingId ] = useState<string | null>(null);

    return (
        <ul className="todo-list">
            {tasks.map(task => (
                <Task
                    key={task.id}
                    task={task}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    />
            ))}
        </ul>
    );
};
