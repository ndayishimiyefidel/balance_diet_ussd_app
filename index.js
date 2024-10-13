const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // Import axios for making API requests

const app = express();

// Middleware to parse URL-encoded form data (from Africa's Talking)
app.use(bodyParser.urlencoded({ extended: false }));


const sessionData = {}; // Store session data per user
// USSD Route
app.post('/ussd', async (req, res) => {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    // Sanitize the input by removing any previously entered input
    const inputArray = text.split('*');
    const input = inputArray[inputArray.length - 1].trim(); // Only take the latest part of the input

    let response = '';

    console.log(`User input: ${input}`);
    console.log(`Current session data for user: ${JSON.stringify(sessionData[phoneNumber])}`);

    // If no input, prompt for ingredients
    if (input === '') {
        response = `CON Welcome to the Balance Diet Recommendation System!
        Enter ingredients separated by commas (e.g., beans, rice, cassava):`;
    }
    // Handle Next Recipe (when input is '1')
    else if (input === '1') {
        if (sessionData[phoneNumber] && sessionData[phoneNumber].recipes) {
            let currentIndex = sessionData[phoneNumber].currentIndex;

            // Move to next recipe if not at the last one
            if (currentIndex < sessionData[phoneNumber].recipes.length - 1) {
                currentIndex++; // Increment index
                sessionData[phoneNumber].currentIndex = currentIndex;
                const nextRecipe = sessionData[phoneNumber].recipes[currentIndex];
                response = paginateRecipeResponse(nextRecipe, currentIndex + 1, sessionData[phoneNumber].recipes.length, false);
            } else {
                response = 'CON You have reached the last recipe.\nPress 2 to go to the previous recipe.';
            }
        } else {
            response = 'END No active session. Please enter ingredients to start.';
        }
    }
    // Handle Previous Recipe (when input is '2')
    else if (input === '2') {
        if (sessionData[phoneNumber] && sessionData[phoneNumber].recipes) {
            let currentIndex = sessionData[phoneNumber].currentIndex;

            // Move to previous recipe if not at the first one
            if (currentIndex > 0) {
                currentIndex--; // Decrement index
                sessionData[phoneNumber].currentIndex = currentIndex;
                const previousRecipe = sessionData[phoneNumber].recipes[currentIndex];
                response = paginateRecipeResponse(previousRecipe, currentIndex + 1, sessionData[phoneNumber].recipes.length, false);
            } else {
                response = 'CON You are at the first recipe.\nPress 1 to see the next recipe.';
            }
        } else {
            response = 'END No active session. Please enter ingredients to start.';
        }
    }
    // Handle showing more ingredients for the current recipe (input '99')
    else if (input === '99') {
        if (sessionData[phoneNumber] && sessionData[phoneNumber].recipes) {
            const currentRecipe = sessionData[phoneNumber].recipes[sessionData[phoneNumber].currentIndex];
            response = paginateRecipeResponse(currentRecipe, sessionData[phoneNumber].currentIndex + 1, sessionData[phoneNumber].recipes.length, true);
        } else {
            response = 'END No active session. Please enter ingredients to start.';
        }
    }
    // Process initial ingredient input
    else {
        const ingredients = input.split(',').map(ingredient => ingredient.trim());

        try {
            const apiResponse = await axios.post('http://localhost:3002/api/recipes', {
                ingredients: ingredients
            });

            const recipes = apiResponse.data;

            if (recipes.length > 0) {
                // Initialize session with recipes and start at index 0
                sessionData[phoneNumber] = {
                    recipes: recipes,
                    currentIndex: 0 // Start at the first recipe
                };

                const firstRecipe = recipes[0];
                response = paginateRecipeResponse(firstRecipe, 1, recipes.length, false);
            } else {
                response = `END Sorry, no recipes found for the ingredients (${ingredients.join(', ')}).`;
            }
        } catch (error) {
            console.error(error);
            response = 'END Sorry, we couldn\'t fetch the recipes at the moment. Please try again later.';
        }
    }

    res.set('Content-Type', 'text/plain');
    res.send(response);
});

function paginateRecipeResponse(recipe, index, total, showFullDetails) {
    let recipeText = `Recipe ${index} of ${total}\n`;

    // Show full details (ingredients) if user pressed 99
    if (showFullDetails) {
        const ingredientsToShow = recipe.ingredients.slice(5); // Show ingredients from index 6 onwards
        recipeText += `More Ingredients:\n${ingredientsToShow.map((ingredient, i) => `${i + 6}. ${ingredient}`).join('\n')}\n`;
    } else {
        // Show the first part of the recipe
        recipeText += `Name: ${recipe.name}\nDescription: ${recipe.description}\nCultural Origin: ${recipe.culturalOrigin}\n`;

        const ingredientsToShow = recipe.ingredients.slice(0, 5); // Show first 5 ingredients
        recipeText += `Ingredients (1-5):\n${ingredientsToShow.map((ingredient, i) => `${i + 1}. ${ingredient}`).join(', ')}\n`;

        if (recipe.ingredients.length > 5) {
            recipeText += `More ingredients available. Press 99 for more details.\n`;
        }
    }

    // Ensure the content is within 160 characters for USSD
    if (recipeText.length > 160) {
        recipeText = recipeText.substring(0, 157) + '...'; // Truncate if necessary
    }

    // Add navigation options clearly and separately
    recipeText += `\n\n1 - Next Recipe\n2 - Previous Recipe\n99 - More Details`;

    return `CON ${recipeText}`;
}



// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`USSD app running on http://localhost:${port}`);
});
