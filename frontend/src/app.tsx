import React from 'react';
import { TodoList } from './todo-list';
import { TaskInput } from './task-input';

export function App() {
    return (
        <div className="app-container">
            <h1>Todo List</h1>
            <TaskInput />
            <TodoList />
        </div>
    );
};
