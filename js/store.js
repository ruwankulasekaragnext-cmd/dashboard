document.addEventListener('alpine:init', () => {
    Alpine.store('app', {
        currentUser: null,
        currentView: 'login', // login, admin, manager, rep
        users: [],
        targets: [],
        value_targets: [],
        stocks: [],
        logs: [],
        lastSyncDate: null,

        init() {
            this.loadData();
        },

        loadData() {
            const storedUsers = localStorage.getItem('sp_users');
            const storedTargets = localStorage.getItem('sp_targets');
            const storedValueTargets = localStorage.getItem('sp_value_targets');
            const storedStocks = localStorage.getItem('sp_stocks');
            const storedLogs = localStorage.getItem('sp_logs');

            // Default Admin if empty
            if (!storedUsers) {
                this.users = [
                    { id: 1, name: 'Super Admin', username: 'admin', password: '123', role: 'ADMIN', avatar: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff' },
                    { id: 2, name: 'Manager One', username: 'manager', password: '123', role: 'MANAGER', avatar: 'https://ui-avatars.com/api/?name=Manager&background=random' },
                    { id: 3, name: 'Rep John', username: 'rep', password: '123', role: 'REP', retailName: 'City Retailers', avatar: 'https://ui-avatars.com/api/?name=John&background=random' }
                ];
                this.save('users');
            } else {
                this.users = JSON.parse(storedUsers);
            }

            this.targets = storedTargets ? JSON.parse(storedTargets) : [];
            this.value_targets = storedValueTargets ? JSON.parse(storedValueTargets) : [];
            this.stocks = storedStocks ? JSON.parse(storedStocks) : [];
            this.logs = storedLogs ? JSON.parse(storedLogs) : [];
            this.lastSyncDate = localStorage.getItem('sp_lastSyncDate') || null;
        },

        save(key) {
            if (key === 'users') localStorage.setItem('sp_users', JSON.stringify(this.users));
            if (key === 'targets') localStorage.setItem('sp_targets', JSON.stringify(this.targets));
            if (key === 'value_targets') localStorage.setItem('sp_value_targets', JSON.stringify(this.value_targets));
            if (key === 'stocks') localStorage.setItem('sp_stocks', JSON.stringify(this.stocks));
            if (key === 'logs') localStorage.setItem('sp_logs', JSON.stringify(this.logs));
        },

        login(username, password) {
            const user = this.users.find(u => u.username === username && u.password === password);
            if (user) {
                this.currentUser = user;
                this.logActivity(user.id, 'Login');

                if (user.role === 'ADMIN') this.currentView = 'admin';
                else if (user.role === 'MANAGER') this.currentView = 'manager';
                else this.currentView = 'rep';
                return true;
            }
            return false;
        },

        logout() {
            this.currentUser = null;
            this.currentView = 'login';
        },

        changePassword(oldPassword, newPassword) {
            if (this.currentUser.password !== oldPassword) {
                return { success: false, message: 'Current password is incorrect' };
            }

            const idx = this.users.findIndex(u => u.id === this.currentUser.id);
            if (idx !== -1) {
                this.users[idx].password = newPassword;
                this.currentUser.password = newPassword;
                this.save('users');
                this.logActivity(this.currentUser.id, 'Changed Password');
                return { success: true, message: 'Password updated successfully' };
            }
            return { success: false, message: 'User not found' };
        },

        logActivity(userId, action) {
            this.logs.unshift({
                id: Date.now(),
                userId,
                action,
                timestamp: new Date().toISOString()
            });
            this.save('logs');
        },

        // --- Admin Functions ---
        updateAvatar(newAvatarUrl) {
            this.currentUser.avatar = newAvatarUrl;
            // Update in users array
            const idx = this.users.findIndex(u => u.id === this.currentUser.id);
            if (idx !== -1) {
                this.users[idx].avatar = newAvatarUrl;
                this.save('users');
            }
        },

        addUser(user) {
            this.users.push({ ...user, id: Date.now(), avatar: `https://ui-avatars.com/api/?name=${user.name}&background=random` });
            this.save('users');
        },
        deleteUser(id) {
            this.users = this.users.filter(u => u.id !== id);
            this.save('users');
        },
        updateUser(updatedUser) {
            const index = this.users.findIndex(u => u.id === updatedUser.id);
            if (index !== -1) {
                this.users[index] = updatedUser;
                this.save('users');
            }
        },

        // --- Target Functions ---
        processTargetUpload(jsonData) {
            // Expected format: [{ RepName, RetailName, Month, Year, Model, Target, Achievement, ValueTarget, ValueAchievement }]
            // Overwrite existing data with new upload
            this.targets = jsonData;
            this.save('targets');
        },

        appendTargetUpload(jsonData) {
            // Append new data to existing targets (for historical data)
            this.targets = [...this.targets, ...jsonData];
            this.save('targets');
        },

        processMasterUpload(targetsQty, targetsValue) {
            // Overwrite with new master data
            this.targets = targetsQty; // From 'Targets Qty' sheet
            this.value_targets = targetsValue; // From 'Targets Value' sheet
            this.lastSyncDate = new Date().toISOString();
            this.save('targets');
            this.save('value_targets');
            localStorage.setItem('sp_lastSyncDate', this.lastSyncDate);
        },

        // --- Rep Functions ---
        updateStock(model, quantity) {
            const existing = this.stocks.find(s => s.model === model && s.repId === this.currentUser.id);
            if (existing) {
                existing.quantity = quantity;
                existing.lastUpdated = new Date().toISOString();
            } else {
                this.stocks.push({
                    id: Date.now(),
                    repId: this.currentUser.id,
                    model,
                    quantity,
                    lastUpdated: new Date().toISOString()
                });
            }
            this.save('stocks');
        },

        getRepPerformance(repId, month, year) {
            const performance = { quantity: [], value: null };

            // Get Model/Quantity Targets
            performance.quantity = this.targets.filter(t =>
                (t.RepName === this.currentUser.name || t.RepName === this.users.find(u => u.id === repId)?.name) &&
                t.Month == month &&
                t.Year == year
            );

            // Get Value Targets (Aggregate for the rep/month)
            const val = this.value_targets.find(v =>
                (v.RepName === this.currentUser.name || v.RepName === this.users.find(u => u.id === repId)?.name) &&
                v.Month == month &&
                v.Year == year
            );

            if (val) {
                performance.value = {
                    target: parseFloat(val.ValueTarget) || 0,
                    achieved: parseFloat(val.ValueAchievement) || 0
                };
            }

            return performance;
        }
    });
});
