import React, { useState } from 'react';
import { Task } from './task';
import { useQuery } from './lib/db-context';
import { ITask } from './defs/task';

//
// Sort tasks by time.
//
function sortTasks(tasks: ITask[]) {
    const sortedTask = [...tasks];
    return sortedTask.sort((a, b) => a.timestamp - b.timestamp);
}

export function TodoList() {

    const { documents: tasks } = useQuery<ITask>("tasks", { transform: sortTasks });
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
