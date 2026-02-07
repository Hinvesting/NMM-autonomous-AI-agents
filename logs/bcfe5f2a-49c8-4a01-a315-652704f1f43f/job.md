I need to create a new skill for thepopebot's Pi agent that enables YouTube search functionality using the YouTube Data API v3. Here's what needs to be built:

### Requirements:

1. **Create a YouTube search skill** in the `.pi/skills/` directory
2. **Add the API key** to `LLM_SECRETS` (since the agent needs access to it)
3. **Build a simple JavaScript function** that uses curl to query the YouTube API
4. **Use sensible defaults** when no special parameters are provided

### Technical Details:

- **API Endpoint**: `https://www.googleapis.com/youtube/v3/search?part=snippet&q={query}&key={API_KEY}`
- **Authentication**: API key only (no OAuth required for public search)
- **Default Parameters**:
  - `part=snippet` (gets basic video info)
  - `maxResults=5` (reasonable default)
  - `type=video` (focus on videos by default)
  - `order=relevance` (most relevant results first)

### Skill Structure:

The skill should be a JavaScript file that:
1. **Accepts a search query** as the main parameter
2. **Constructs the API URL** with proper encoding
3. **Makes the HTTP request** using curl via child_process
4. **Parses the JSON response** and formats it nicely
5. **Handles errors** gracefully
6. **Returns structured data** with video titles, descriptions, URLs, and basic stats

### Expected Output Format:

For each video result, return:
- Video title
- Channel name  
- Description snippet
- YouTube URL (`https://youtube.com/watch?v={videoId}`)
- Published date
- View count (if available in snippet)

### Implementation Notes:

- Use `child_process.execSync()` to run curl commands
- URL encode the search query properly using `encodeURIComponent()`
- The API key should be accessed from `process.env.YOUTUBE_API_KEY`
- Include error handling for network issues, API errors, and invalid responses
- Format the output as a clean, readable structure that the agent can easily work with
- Add helpful comments explaining the API parameters and response structure