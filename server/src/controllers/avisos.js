export function avisoController(service) {
  return {
    options: async (_req, res, next) => {
      try { res.status(200).json(await service.options()); } catch (error) { next(error); }
    },

    // SCRUM-57 / US-014: consulta del feed de avisos activos.
    listActive: async (req, res, next) => {
      try {
        res.status(200).json(await service.listActive(req.query));
      } catch (error) {
        next(error);
      }
    },

    listForClosure: async (req, res, next) => {
      try { res.json(await service.listForClosure(req.user.id)); } catch (error) { next(error); }
    },

    close: async (req, res, next) => {
      try { res.json(await service.close(req.user.id, req.params.id, req.body)); } catch (error) { next(error); }
    },

    publish: async (req, res, next) => {
      try { res.status(201).json(await service.publish(req.user.id, req.body)); } catch (error) { next(error); }
    },

    // SCRUM-122 / US-016: avisos propios y su edición.
    listOwn: async (req, res, next) => {
      try { res.status(200).json(await service.listOwn(req.user.id)); } catch (error) { next(error); }
    },

    getOwn: async (req, res, next) => {
      try { res.status(200).json(await service.getOwn(req.user.id, req.params.id)); } catch (error) { next(error); }
    },

    update: async (req, res, next) => {
      try { res.status(200).json(await service.update(req.user.id, req.params.id, req.body)); } catch (error) { next(error); }
    },
  };
}