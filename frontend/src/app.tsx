import React, { useState } from 'react';
import { TodoList } from './todo-list';
import { TaskInput } from './task-input';
import { useDatabase } from './lib/db-context';

export function App() {

    const { userId, changeUser } = useDatabase();
    const [ userInput, setUserInput ] = useState(userId);

    return (
        <div className="app-container">
            <h1>Todo List</h1>

            <div>
                <input
                    type="text"
                    value={userInput}
                    onChange={evt => setUserInput(evt.target.value)}
                    />
                <button
                    onClick={() => changeUser(userInput)}
                    >
                    Set User ID
                </button>
            </div>

            <TaskInput />
            <TodoList />
        </div>
    );
};
