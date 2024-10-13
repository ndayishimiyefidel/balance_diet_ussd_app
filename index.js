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
    let recipeText = `Recipe ${index}/${total}`;

    // If the user wants to see more details (pressed 99)
    if (showFullDetails) {
        // Show more ingredients or details of the recipe
        const ingredientsToShow = recipe.ingredients.slice(5); // Show ingredients from index 6 onwards
        recipeText += `\nMore Ingredients:\n${ingredientsToShow.map((ingredient, i) => `${i + 6}. ${ingredient}`).join('\n')}`;

        // Include remaining information or details
        recipeText += `\n\n1-Next | 2-Prev | 99-More details`;
    } else {
        // Show the first part of the recipe, limited to 160 characters
        recipeText += `\nName: ${recipe.name}\nDescription: ${recipe.description}\nCultural: ${recipe.culturalOrigin}`;

        const ingredientsToShow = recipe.ingredients.slice(0, 5); // Show first 5 ingredients
        recipeText += `\nIngredients (1-5):\n${ingredientsToShow.map((ingredient, i) => `${i + 1}. ${ingredient}`).join(', ')}`;

        if (recipe.ingredients.length > 5) {
            recipeText += `\nMore: Press 99`; // Prompt to show more ingredients/details if there are more than 5
        }
        
        recipeText += `\n\n1-Next | 2-Prev | 99-More details`; // Always show navigation options
    }

    // Ensure response fits within 160 characters for USSD
    if (recipeText.length > 300) {
        recipeText = recipeText.substring(0, 290) + '...'; // Truncate if too long
    }

    return `CON ${recipeText}`;
}



// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`USSD app running on http://localhost:${port}`);
});
