import { LinearClient } from "@linear/sdk";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface GetTicketByIdArgs {
  apiKey: string;
  ticketId: string;
}

export interface TicketResponse {
  id: string;
  title: string;
  description?: string;
  number: number;
  key: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  estimate?: number;
  priority?: number;
  assignee: { id: string; name: string; email: string } | null;
  team: { id: string; name: string; key: string } | null;
  state: { id: string; name: string; type: string } | null;
  labels: Array<{ id: string }>;
  url: string;
}

/**
 * Handler for retrieving a specific ticket by ID or key
 */
export async function handleRequest(
  args: GetTicketByIdArgs,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate API key
  if (!args.apiKey) {
    throw new McpError(ErrorCode.InvalidParams, "Linear API key is required");
  }

  // Validate ticket ID
  if (!args.ticketId) {
    throw new McpError(ErrorCode.InvalidParams, "Ticket ID or key is required");
  }

  try {
    // Initialize Linear client
    const linearClient = new LinearClient({
      apiKey: args.apiKey,
    });

    // Parse the ticket ID to determine if it's a key or ID
    let issue;

    try {
      // We're going to try a different approach that's more compatible with the Linear SDK
      // Instead of using issue.fetch() which might not exist, we'll get the data directly

      if (args.ticketId.includes("-")) {
        // It's a ticket key like "ABC-123"
        const [teamKey, issueNumber] = args.ticketId.split("-");

        // Get issues that match the team key and issue number
        const issues = await linearClient.issues({
          filter: {
            team: {
              key: {
                eq: teamKey,
              },
            },
            number: {
              eq: parseInt(issueNumber, 10),
            },
          },
        });

        if (issues.nodes.length === 0) {
          throw new McpError(
            ErrorCode.InternalError,
            `Ticket not found: ${args.ticketId}`,
          );
        }

        issue = issues.nodes[0];
      } else {
        // It's likely an ID, try to get it directly
        const issues = await linearClient.issues({
          filter: {
            id: {
              eq: args.ticketId,
            },
          },
        });

        if (issues.nodes.length === 0) {
          throw new McpError(
            ErrorCode.InternalError,
            `Ticket not found: ${args.ticketId}`,
          );
        }

        issue = issues.nodes[0];
      }
    } catch (error) {
      console.error("Error finding ticket:", error);
      throw new McpError(
        ErrorCode.InternalError,
        `Could not find ticket: ${args.ticketId}`,
      );
    }

    // Check if issue exists
    if (!issue) {
      throw new McpError(
        ErrorCode.InternalError,
        `Ticket not found: ${args.ticketId}`,
      );
    }

    // Get additional data for the ticket
    // For assignee
    let assignee = null;
    if (issue.assigneeId) {
      try {
        const users = await linearClient.users({
          filter: {
            id: {
              eq: issue.assigneeId,
            },
          },
        });

        if (users && users.nodes.length > 0) {
          const userData = users.nodes[0];
          assignee = {
            id: userData.id,
            name: userData.name || "Unknown",
            email: userData.email || "",
          };
        }
      } catch (error) {
        console.warn("Error fetching assignee:", error);
      }
    }

    // For team
    let team = null;
    if (issue.teamId) {
      try {
        const teams = await linearClient.teams({
          filter: {
            id: {
              eq: issue.teamId,
            },
          },
        });

        if (teams && teams.nodes.length > 0) {
          const teamData = teams.nodes[0];
          team = {
            id: teamData.id,
            name: teamData.name || "Unknown",
            key: teamData.key || "TEAM",
          };
        }
      } catch (error) {
        console.warn("Error fetching team:", error);
      }
    }

    // For state
    let state = null;
    if (issue.stateId) {
      try {
        const states = await linearClient.workflowStates({
          filter: {
            id: {
              eq: issue.stateId,
            },
          },
        });

        if (states && states.nodes.length > 0) {
          const stateData = states.nodes[0];
          state = {
            id: stateData.id,
            name: stateData.name || "Unknown",
            type: stateData.type || "Unknown",
          };
        }
      } catch (error) {
        console.warn("Error fetching state:", error);
      }
    }

    // Generate the key if not available
    const ticketKey =
      issue.key ||
      (team ? `${team.key}-${issue.number}` : `ISSUE-${issue.number}`);

    // Format the ticket data
    const ticketData = {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      number: issue.number,
      key: ticketKey,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      dueDate: issue.dueDate,
      estimate: issue.estimate,
      priority: issue.priority,
      assignee,
      team,
      state,
      labels: issue.labelIds
        ? issue.labelIds.map((id: string) => ({ id }))
        : [],
      url: issue.url,
    };

    // Return in the format expected by the MCP
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(ticketData, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    console.error("Error retrieving ticket:", error);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to retrieve ticket: ${(error as Error).message}`,
    );
  }
}
