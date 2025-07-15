const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios"); // Import axios for making API requests

const app = express();

// Middleware to parse URL-encoded form data (from Africa's Talking)
app.use(bodyParser.urlencoded({ extended: false }));

const sessionData = {}; // Store session data per user

// USSD Route
app.post("/ussd", async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  // Sanitize the input by removing any previously entered input
  const inputArray = text.split("*");
  const input = inputArray[inputArray.length - 1].trim(); // Only take the latest part of the input

  let response = "";

  console.log(`User input: ${input}`);
  console.log(`Phone number: ${phoneNumber}`);
  console.log(`Session ID: ${sessionId}`);
  console.log(
    `Current session data for user: ${JSON.stringify(sessionData[phoneNumber])}`
  );

  // If no input, prompt for ingredients
  if (input === "") {
    response = `CON Welcome to the Personalized Balance Diet Recommendation System!
Enter ingredients separated by commas (e.g., beans, rice, cassava):`;
  }
  // Handle Next Recipe (when input is '1')
  else if (input === "1") {
    if (sessionData[phoneNumber] && sessionData[phoneNumber].recipes) {
      let currentIndex = sessionData[phoneNumber].currentIndex;

      // Move to next recipe if not at the last one
      if (currentIndex < sessionData[phoneNumber].recipes.length - 1) {
        currentIndex++; // Increment index
        sessionData[phoneNumber].currentIndex = currentIndex;
        const nextRecipe = sessionData[phoneNumber].recipes[currentIndex];
        response = paginateRecipeResponse(
          nextRecipe,
          currentIndex + 1,
          sessionData[phoneNumber].recipes.length,
          false
        );
      } else {
        response =
          "CON You have reached the last recipe.\nPress 2 to go to the previous recipe.";
      }
    } else {
      response = "END No active session. Please enter ingredients to start.";
    }
  }
  // Handle Previous Recipe (when input is '2')
  else if (input === "2") {
    if (sessionData[phoneNumber] && sessionData[phoneNumber].recipes) {
      let currentIndex = sessionData[phoneNumber].currentIndex;

      // Move to previous recipe if not at the first one
      if (currentIndex > 0) {
        currentIndex--; // Decrement index
        sessionData[phoneNumber].currentIndex = currentIndex;
        const previousRecipe = sessionData[phoneNumber].recipes[currentIndex];
        response = paginateRecipeResponse(
          previousRecipe,
          currentIndex + 1,
          sessionData[phoneNumber].recipes.length,
          false
        );
      } else {
        response =
          "CON You are at the first recipe.\nPress 1 to see the next recipe.";
      }
    } else {
      response = "END No active session. Please enter ingredients to start.";
    }
  }
  // Handle showing more ingredients for the current recipe (input '99')
  else if (input === "99") {
    if (sessionData[phoneNumber] && sessionData[phoneNumber].recipes) {
      const currentRecipe =
        sessionData[phoneNumber].recipes[sessionData[phoneNumber].currentIndex];
      response = paginateRecipeResponse(
        currentRecipe,
        sessionData[phoneNumber].currentIndex + 1,
        sessionData[phoneNumber].recipes.length,
        true
      );
    } else {
      response = "END No active session. Please enter ingredients to start.";
    }
  }
  // Process initial ingredient input
  else {
    // Validate input
    if (!input || input.trim() === "") {
      response = "END Please enter valid ingredients separated by commas.";
      res.set("Content-Type", "text/plain");
      res.send(response);
      return;
    }

    const ingredients = input.split(",").map((ingredient) => ingredient.trim()).filter(ingredient => ingredient.length > 0);

    if (ingredients.length === 0) {
      response = "END Please enter at least one valid ingredient.";
      res.set("Content-Type", "text/plain");
      res.send(response);
      return;
    }

    console.log(`Searching for recipes with ingredients: ${ingredients.join(', ')}`);

    try {
      // Add timeout and better error handling
      const apiResponse = await axios.post(
        "http://localhost:3005/api/recipes",
        {
          ingredients: ingredients,
        },
        {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`API Response status: ${apiResponse.status}`);
      console.log(`API Response data: ${JSON.stringify(apiResponse.data)}`);

      const recipes = apiResponse.data;

      if (recipes && recipes.length > 0) {
        // Initialize session with recipes and start at index 0
        sessionData[phoneNumber] = {
          recipes: recipes,
          currentIndex: 0, // Start at the first recipe
        };

        const firstRecipe = recipes[0];
        response = paginateRecipeResponse(
          firstRecipe,
          1,
          recipes.length,
          false
        );
      } else {
        response = `END Sorry, no recipes found for the ingredients (${ingredients.join(
          ", "
        )}). Please try different ingredients.`;
      }
    } catch (error) {
      console.error("Error fetching recipes:", error.message);
      
      if (error.code === 'ECONNREFUSED') {
        response = "END Recipe service is not available. Please try again later.";
      } else if (error.code === 'ETIMEDOUT') {
        response = "END Request timed out. Please try again.";
      } else if (error.response) {
        console.error("API Error Status:", error.response.status);
        console.error("API Error Data:", error.response.data);
        response = "END Recipe service error. Please try again later.";
      } else {
        response = "END Sorry, we couldn't fetch the recipes at the moment. Please try again later.";
      }
    }
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

function paginateRecipeResponse(recipe, index, total, showFullDetails) {
  let recipeText = `Recipe ${index} of ${total}\n`;

  // Parse ingredients string into array
  const ingredientsArray = recipe.ingredients ? 
    recipe.ingredients.split('\n').filter(ingredient => ingredient.trim().length > 0) : 
    [];

  // Show full details (ingredients) if user pressed 99
  if (showFullDetails) {
    const ingredientsToShow = ingredientsArray.slice(5); // Show ingredients from index 6 onwards
    if (ingredientsToShow.length > 0) {
      recipeText += `More Ingredients:\n${ingredientsToShow
        .map((ingredient, i) => `${i + 6}. ${ingredient.trim()}`)
        .join("\n")}\n`;
    } else {
      recipeText += "No more ingredients to show.\n";
    }
  } else {
    // Show the first part of the recipe
    recipeText += `Name: ${recipe.name || 'Unknown'}\n`;
    recipeText += `Description: ${recipe.description || 'No description available'}\n`;
    recipeText += `Cultural Origin: ${recipe.culturalOrigin || 'Unknown'}\n`;

    if (ingredientsArray.length > 0) {
      const ingredientsToShow = ingredientsArray.slice(0, 5); // Show first 5 ingredients
      recipeText += `Ingredients (1-5):\n${ingredientsToShow
        .map((ingredient, i) => `${i + 1}. ${ingredient.trim()}`)
        .join("\n")}\n`;

      if (ingredientsArray.length > 5) {
        recipeText += `More ingredients available. Press 99 for more details.\n`;
      }
    } else {
      recipeText += "No ingredients listed.\n";
    }
  }

  // Ensure the content is within 160 characters for USSD
  if (recipeText.length > 160) {
    recipeText = recipeText.substring(0, 157) + "..."; // Truncate if necessary
  }

  // Add navigation options clearly and separately
  recipeText += `\n\n1 - Next Recipe\n2 - Previous Recipe\n99 - More Details`;

  return `CON ${recipeText}`;
}

// Start the server
const port = process.env.PORT || 3010;
app.listen(port, () => {
  console.log(`USSD app running on http://localhost:${port}`);
  console.log(`Make sure the recipe APIs is running on http://localhost:3005`);
});
