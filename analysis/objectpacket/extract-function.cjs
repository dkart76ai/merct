// Function to extract valid object arrays from deeply nested structure
// Valid pattern: [ [id], staticId, 0, 2, 0, level, 0, 0, [k, x, y], [0], extra, boolean ]

function extractObjects(data) {
    const objects = [];
    
    function isValidObject(arr) {
        if (!Array.isArray(arr) || arr.length !== 12) return false;
        
        // First element: array with 1 element
        if (!Array.isArray(arr[0]) || arr[0].length !== 1) return false;
        
        // 9th element (index 8): array with 3 elements
        if (!Array.isArray(arr[8]) || arr[8].length !== 3) return false;
        
        // 10th element (index 9): array with 1 element
        if (!Array.isArray(arr[9]) || arr[9].length !== 1) return false;
        
        // Last element (index 11): boolean
        if (typeof arr[11] !== 'boolean') return false;
        
        return true;
    }
    
    function findObjects(arr, depth = 0) {
        if (depth > 20) return; // Prevent infinite recursion
        
        for (const item of arr) {
            if (Array.isArray(item)) {
                if (isValidObject(item)) {
                    objects.push({
                        objectId: item[0][0],
                        staticId: item[1],
                        unk1: item[2],
                        unk2: item[3],
                        unk3: item[4],
                        level: item[5],
                        unk4: item[6],
                        unk5: item[7],
                        kingdom: item[8][0],
                        x: item[8][1],
                        y: item[8][2],
                        unk6: item[9][0],
                        extra: item[10],
                        isActive: item[11]
                    });
                } else {
                    // Recurse into nested arrays
                    findObjects(item, depth + 1);
                }
            }
        }
    }
    
    findObjects(data);
    return objects;
}

// Usage example:
// const objects = extractObjects(yourDeeplyNestedArray);
