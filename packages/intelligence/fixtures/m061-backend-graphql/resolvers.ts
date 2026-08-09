export const resolvers = {
  Query: {
    user: (_: unknown, args: { id: string }) => ({ id: args.id, name: "Ada" }),
    users: () => [],
  },
  Mutation: {
    createUser: (_: unknown, args: { name: string }) => ({
      id: "1",
      name: args.name,
    }),
  },
};
